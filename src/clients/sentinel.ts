import * as tls from "tls";
import { Single } from "./single";
import FalkorDB from "../falkordb";
import type { SingleGraphConnection, TypedRedisClientOptions } from "../types";
import {
  ClientClosedError,
  ClientOfflineError,
  createClient,
  DisconnectsClientError,
  ErrorReply,
  RedisFunctions,
  RedisScripts,
  SocketClosedUnexpectedlyError,
} from "@redis/client";
import commands from "../commands";
import type { RunOptions } from "./single";

// How many times a command is resent after losing its connection to the master
const MAX_COMMAND_RETRIES = 3;

// Backoff between attempts to re-discover the master
const MIN_RECOVERY_DELAY_MS = 100;
const MAX_RECOVERY_DELAY_MS = 2000;

// How long a demoted master's connection may take to finish in-flight commands
const CLOSE_TIMEOUT_MS = 5000;

// Connections destroyed while commands may still have been in flight, whose
// DisconnectsClientError rejections therefore have an unknown outcome
const forceClosed = new WeakSet<SingleGraphConnection>();

const RETRYABLE_SOCKET_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/**
 * Whether the command certainly did not run on the server, so it is safe to
 * resend it to the current master.
 */
function wasNotExecuted(err: unknown, client: SingleGraphConnection) {
  if (err instanceof DisconnectsClientError && forceClosed.has(client)) {
    return false;
  }
  if (err instanceof ErrorReply) {
    // The node was demoted to a replica while the command was queued or blocked
    return /^(READONLY|UNBLOCKED)\b/.test(err.message);
  }
  // Rejected before being sent: on a closed client, or flushed unsent when a
  // dead master connection is destroyed (see dropClient)
  return (
    err instanceof ClientClosedError ||
    err instanceof ClientOfflineError ||
    err instanceof DisconnectsClientError
  );
}

/**
 * Whether the connection dropped while waiting for the reply, so the command
 * may or may not have run on the server.
 */
function isConnectionLost(err: unknown, client: SingleGraphConnection) {
  return (
    err instanceof SocketClosedUnexpectedlyError ||
    (err instanceof DisconnectsClientError && forceClosed.has(client)) ||
    RETRYABLE_SOCKET_CODES.has((err as NodeJS.ErrnoException)?.code ?? "")
  );
}

/**
 * Stops using a master connection. Commands still unsent are rejected with
 * DisconnectsClientError, which run() resends.
 */
function dropClient(client: SingleGraphConnection) {
  if (client.isReady) {
    // The connection is alive (e.g. the node was demoted): let in-flight
    // commands get their replies, so none is left with an unknown outcome.
    // If they take too long, give up on them: their outcome is then unknown.
    const forceClose = () => {
      forceClosed.add(client);
      client.destroy();
    };
    const timer = setTimeout(forceClose, CLOSE_TIMEOUT_MS);
    timer.unref?.();
    client
      .close()
      .catch(forceClose)
      .finally(() => clearTimeout(timer));
  } else {
    // The socket is gone. Destroy once node-redis has failed the in-flight
    // commands with the socket error, so that DisconnectsClientError only
    // reaches commands that were never sent.
    queueMicrotask(() => client.destroy());
  }
}

export interface SentinelOptions {
  /**
   * Resend write commands to the new master when the connection is lost while
   * waiting for their reply. The old master may have already run them, so a
   * write can be applied twice. Read-only commands, and commands the server
   * certainly did not run, are always resent.
   * @default false
   */
  retryWritesOnConnectionLoss?: boolean;
}

function extractDetails(masters: Array<Array<string>>) {
  const allDetails: Record<string, string>[] = [];
  for (const master of masters) {
    const details: Record<string, string> = {};
    for (let i = 0; i < master.length; i += 2) {
      details[master[i]] = master[i + 1];
    }
    allDetails.push(details);
  }
  return allDetails;
}

export class Sentinel extends Single {
  private sentinelClient!: SingleGraphConnection;
  private redisOption: TypedRedisClientOptions = {};
  private falkordb?: FalkorDB;

  // Set once the first master connection is up; recovery only runs after that
  private ready = false;
  private closed = false;

  // Pending re-discovery of the master, shared by every command waiting on it
  private recovery: Promise<void> | null = null;

  private readonly retryWritesOnConnectionLoss: boolean;

  constructor(client: SingleGraphConnection, options: SentinelOptions = {}) {
    super(client);
    this.retryWritesOnConnectionLoss = options.retryWritesOnConnectionLoss ?? false;
  }

  async init(falkordb: FalkorDB): Promise<void> {
    this.redisOption = (this.client.options ?? {}) as TypedRedisClientOptions;
    this.falkordb = falkordb;
    await this.tryConnectSentinelServer(this.client, this.redisOption, falkordb);
    this.ready = true;
  }

  /**
   * Runs a command on the current master. If the master connection is lost, or
   * the node was demoted, waits for the new master and resends the command
   * there when that is safe: the command certainly did not run, it is
   * read-only, or `retryWritesOnConnectionLoss` is set.
   */
  protected async run<T>(
    fn: (client: SingleGraphConnection) => Promise<T>,
    { readOnly = false }: RunOptions = {}
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (this.recovery) {
        await this.recovery;
      }
      const client = this.client;
      try {
        return await fn(client);
      } catch (err) {
        const notExecuted = wasNotExecuted(err, client);
        const connectionLost = isConnectionLost(err, client);
        if (this.closed || (!notExecuted && !connectionLost)) {
          throw err;
        }

        // Switch to the new master even when this command is not resent
        // e.g. READONLY: the connection is fine but points to a replica now
        if (this.client === client) {
          this.recover(client);
        }

        const resend =
          notExecuted || readOnly || this.retryWritesOnConnectionLoss;
        if (!resend || attempt >= MAX_COMMAND_RETRIES) {
          throw err;
        }
        console.debug("Command failed on master connection, retrying", err);
      }
    }
  }

  /**
   * Re-discovers the master and reconnects, retrying with backoff until it
   * succeeds or the client is closed.
   */
  private recover(failedClient: SingleGraphConnection): Promise<void> {
    if (this.recovery) {
      return this.recovery;
    }

    // Stop sending to the old master. Commands it rejects unsent are resent
    // by run() once the new master is up.
    dropClient(failedClient);

    this.recovery = (async () => {
      for (let attempt = 0; !this.closed; attempt++) {
        try {
          await this.tryConnectSentinelServer(
            this.sentinelClient,
            this.redisOption,
            this.falkordb!
          );
          console.debug("Connected to server");
          return;
        } catch (e) {
          console.debug("Error on server reconnect", e);
          // Emitting "error" without a listener throws, which would end recovery
          if (this.falkordb?.listenerCount("error")) {
            this.falkordb.emit("error", e);
          }
          const delay = Math.min(
            MIN_RECOVERY_DELAY_MS * 2 ** attempt,
            MAX_RECOVERY_DELAY_MS
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw new ClientClosedError();
    })().finally(() => {
      this.recovery = null;
    });

    // Avoid an unhandled rejection when no command is waiting on it
    this.recovery.catch(() => {});
    return this.recovery;
  }

  /**
   * Connect to the server using the details from sentinel server
   * Register error event to reconnect on error from the sentinel server
   */
  private async tryConnectSentinelServer(
    client: SingleGraphConnection,
    redisOption: TypedRedisClientOptions,
    _falkordb: FalkorDB
  ) {
    // TODO support multi sentinels
    const masters = await client.falkordb.sentinelMasters();
    const details = extractDetails(masters);

    if (details.length > 1) {
      throw new Error("Multiple masters are not supported");
    }

    // Connect to the server with the details from sentinel
    const socketOptions: tls.ConnectionOptions = {
      ...redisOption.socket,
      host: details[0]["ip"] as string,
      port: parseInt(details[0]["port"]),
    };
    const serverOptions: TypedRedisClientOptions = {
      ...redisOption,
      socket: socketOptions,
    };
    const realClient = createClient<
      { falkordb: typeof commands },
      RedisFunctions,
      RedisScripts,
      2,
      {}
    >(serverOptions);

    // Save sentinel client to quit on quit()
    this.sentinelClient = client;

    // Set original client as sentinel and server client as client
    this.client = realClient;

    try {
      await realClient
        .on("error", (err) => {
          console.debug("Error on server connection", err);

          // Errors on a previous server connection, or before the first
          // connection is up (init() reports those), need no recovery
          if (this.client !== realClient || !this.ready || this.recovery) {
            dropClient(realClient);
            return;
          }

          this.recover(realClient);
        })
        .connect();
    } catch (err) {
      realClient.destroy();
      throw err;
    }
  }

  quit() {
    return this.disconnect();
  }

  async disconnect() {
    this.closed = true;
    const promises = [super.disconnect()];
    if (this.sentinelClient) {
      const reply = this.sentinelClient.disconnect();
      promises.push(reply.then(() => {}));
    }
    return Promise.all(promises).then(() => {});
  }
}
