
import { EventEmitter } from 'events';

import { RedisFunctions, RedisScripts, createClient } from 'redis';

import Graph, { GraphSchemaState } from './graph';
import commands from './commands';
import { SocketClosedUnexpectedlyError, SocketTimeoutError } from '@redis/client';
import { Client } from './clients/client';
import { Single } from './clients/single';
import { Sentinel, type SentinelOptions } from './clients/sentinel';
import { Cluster } from './clients/cluster';
import { NullClient } from './clients/nullClient';
import type { FalkorDBOptions, SingleGraphConnection, TypedRedisClientOptions } from './types';

export type {
    FalkorDBOptions,
    SocketOptions,
    TypedRedisClientOptions,
    TypedRedisClusterClientOptions,
} from './types';

/**
 * Retries the initial connection gets before `FalkorDB.connect()` rejects.
 */
const INITIAL_CONNECT_RETRIES = 3;

/**
 * node-redis' default back-off: exponential up to 2s plus jitter, and no
 * reconnect after a socket timeout.
 */
function defaultReconnectStrategy(retries: number, cause: Error): number | false {
    if (cause instanceof SocketTimeoutError) {
        return false;
    }
    return Math.min(Math.pow(2, retries) * 50, 2000) + Math.floor(Math.random() * 200);
}

function initialReconnectStrategy(retries: number, cause: Error, tlsEnabled: boolean): number | false | Error {
    if (retries < INITIAL_CONNECT_RETRIES) {
        return defaultReconnectStrategy(retries, cause);
    }
    // A TLS server drops a plain-text client mid-handshake, which node-redis
    // reports as the socket closing unexpectedly.
    const hint = !tlsEnabled && cause instanceof SocketClosedUnexpectedlyError
        ? ' The server closed the connection during the handshake; if it requires TLS, set `socket.tls: true` or use a `rediss://` URL.'
        : '';
    return new Error(`Failed to connect to FalkorDB: ${cause.message}.${hint}`, { cause });
}

async function clientFactory(client: SingleGraphConnection, sentinelOptions: SentinelOptions) {

    const info = await client.info("server")

    if (info.includes("redis_mode:sentinel")) {
        return new Sentinel(client, sentinelOptions)
    } else if (info.includes("redis_mode:cluster")) {
        // Connecting through a replica (or asking for `readonly`) opts in to
        // serving read-only commands from replicas, see `Cluster`.
        const replication = await client.info("replication");
        const useReplicas = client.options?.readonly === true || /^role:slave\r?$/m.test(replication);
        return new Cluster(client, { useReplicas });
    }
    return new Single(client)
}

// Upper bound on the `Graph` instances `selectGraph` keeps. Past it the least
// recently selected one is dropped; that only costs its metadata cache, which
// the next `selectGraph` for that id rebuilds.
const MAX_CACHED_GRAPHS = 1000;

export default class FalkorDB extends EventEmitter {

    #client: Client = new NullClient();
    #integers: 'number' | 'bigint' = 'number';
    #graphs = new Map<string, Graph>();
    // Shared by every instance for a graph id, including ones evicted from
    // #graphs that callers still hold. Weakly held, so an entry lives only as
    // long as some instance using it does.
    #schemas = new Map<string, WeakRef<GraphSchemaState>>();
    #schemasCleanup = new FinalizationRegistry<string>((graphId) => {
        if (!this.#schemas.get(graphId)?.deref()) {
            this.#schemas.delete(graphId);
        }
    });

    static async connect(options?: FalkorDBOptions) {
        const { host, port, retryWritesOnConnectionLoss, integers = 'number', ...rest } = options ?? {};
        const redisOption = rest as TypedRedisClientOptions;

        if (integers !== 'number' && integers !== 'bigint') {
            throw new TypeError(`integers must be 'number' or 'bigint', not ${JSON.stringify(integers)}`);
        }

        // Support the top-level `host`/`port` shorthand used by the other FalkorDB
        // clients by folding them into the socket options node-redis expects.
        // Explicit `socket` values win, and `url` takes precedence over both.
        if (!redisOption.url && (host !== undefined || port !== undefined)) {
            redisOption.socket = {
                ...(host !== undefined && { host }),
                ...(port !== undefined && { port }),
                ...redisOption.socket,
            } as TypedRedisClientOptions['socket'];
        }

        // If the URL is provided, and the protocol is `falkor` replaces it with `redis` for the underline redis client
        // e.g. falkor://localhost:6379 -> redis://localhost:6379
        if (redisOption.url && redisOption.url.startsWith('falkor')) {
            redisOption.url = redisOption.url.replace('falkor', 'redis');
        }

        redisOption.modules = {
            falkordb: commands
        }

        // node-redis v6 defaults to RESP3, which auto-converts module map replies
        // into nested objects: `GRAPH.MEMORY USAGE` comes back as
        // `{ total_graph_sz_mb: 0, ... }` instead of the flat
        // `['total_graph_sz_mb', 0, ...]` that the reply parsers - and the
        // `MemoryUsageReply` array type - are written against. So RESP 2 is a
        // requirement here, not a default: honouring an explicit RESP 3 would
        // hand the caller a reply shape the published types say is impossible.
        // The sentinel and cluster clients reuse this options object, so they
        // inherit the pin too.
        const requestedRESP = (redisOption as { RESP?: number }).RESP;
        if (requestedRESP !== undefined && requestedRESP !== 2) {
            throw new Error(
                `FalkorDB requires RESP 2, but RESP ${requestedRESP} was requested. ` +
                'Under RESP 3 node-redis rewrites module map replies into objects, which does ' +
                'not match the reply shapes this client parses and publishes types for.'
            );
        }
        redisOption.RESP = 2;

        // node-redis retries the first connection forever by default, so a server
        // that keeps closing the socket - e.g. a TLS server reached without TLS -
        // leaves `connect()` pending indefinitely. Unless the caller chose a
        // strategy, give up after a few attempts while connecting and keep the
        // usual unbounded back-off once connected. The sentinel and cluster
        // clients reuse these socket options, so `connected` is only set once
        // they are up too: a node discovered during `init()` that cannot be
        // reached must fail `connect()` as well.
        let connected = false;
        if (redisOption.socket?.reconnectStrategy === undefined) {
            const tlsEnabled = redisOption.socket?.tls === true || !!redisOption.url?.startsWith('rediss:');
            redisOption.socket = {
                ...redisOption.socket,
                reconnectStrategy: (retries: number, cause: Error) =>
                    connected
                        ? defaultReconnectStrategy(retries, cause)
                        : initialReconnectStrategy(retries, cause, tlsEnabled),
            } as TypedRedisClientOptions['socket'];
        }

        // Create an empty FalkorDB instance for the redisClient on error event to work
        const falkordb = new FalkorDB();

        // Create initial redis single client
        const redisClient = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts, 2, {}>(redisOption)
        await redisClient
            // Forward errors. Nobody can listen on `falkordb` before it is returned,
            // so emitting while connecting would only throw an unhandled 'error';
            // those failures reach the caller as the rejection of `connect()`.
            .on('error', err => { if (connected) falkordb.emit('error', err) })
            .connect();

        // Create FalkorDB client wrapper
        let client: Client | undefined;
        try {
            client = await clientFactory(redisClient, { retryWritesOnConnectionLoss });
            await client.init(falkordb);
        } catch (err) {
            // The caller gets no instance to close, so close what is open here
            try {
                if (client) await client.disconnect();
                else redisClient.destroy();
            } catch {
                // Already closed
            }
            throw err;
        }
        connected = true;

        // Set the client to the FalkorDB instance after it was initialized
        falkordb.#client = client;  
        falkordb.#integers = integers;

        return falkordb
    }

    /**
     * Returns the `Graph` for `graphId`. Repeated calls with the same id return
     * the same instance, so its cached metadata (labels, relationship types and
     * property keys) is shared instead of being refetched by every new handle.
     * The instance is released when the graph is deleted through it, or when
     * more than `MAX_CACHED_GRAPHS` graphs have been selected since its last use.
     * Each query carries the schema version the cached metadata matches, so a
     * schema changed by another client (e.g. the graph deleted and recreated) is
     * rejected by the server and the metadata refreshed before the query is retried.
     */
    selectGraph(graphId: string) {
        let graph = this.#graphs.get(graphId);
        if (graph) {
            // Re-insert so the Map's insertion order tracks recency of use
            this.#graphs.delete(graphId);
        } else {
            graph = new Graph(this.#client, graphId, {
                schema: this.#schema(graphId),
                onDelete: (deleted) => {
                    // An instance already evicted must not remove its replacement
                    if (this.#graphs.get(graphId) === deleted) {
                        this.#graphs.delete(graphId);
                    }
                },
                selectGraph: (name) => this.selectGraph(name),
                integers: this.#integers,
            });
        }
        this.#graphs.set(graphId, graph);

        if (this.#graphs.size > MAX_CACHED_GRAPHS) {
            this.#graphs.delete(this.#graphs.keys().next().value!);
        }
        return graph;
    }

    #schema(graphId: string) {
        let schema = this.#schemas.get(graphId)?.deref();
        if (!schema) {
            schema = { generation: 0, version: 0 };
            this.#schemas.set(graphId, new WeakRef(schema));
            this.#schemasCleanup.register(schema, graphId);
        }
        return schema;
    }

    public get connection() {
        return this.#client.getConnection();
    }

    async list() {
        return this.#client.list()
    }

    /**
     * Lists the graphs that are currently offloaded to disk ("stubs").
     *
     * `GRAPH.STUBS` is provided by the FalkorDB Enterprise graph-offloading
     * module, so this rejects with an "unknown command" error on deployments
     * where that module is not loaded. Callers that support both editions
     * should treat such a rejection as "no offloading support".
     */
    async stubs() {
        return this.#client.stubs()
    }

    async configGet(configKey: string) {
        return this.#client.configGet(configKey)
    }

    async configSet(configKey: string, value: number | string) {
        return this.#client.configSet(configKey, value)
    }

    async info(section?: string) {
        return this.#client.info(section)
    }

    async udfLoad(name: string, script: string | Function, replace: boolean = false) {
        return this.#client.udfLoad(name, script, replace);
    }

    async udfList(lib?: string, withCode: boolean = false) {
        return this.#client.udfList(lib, withCode);
    }

    async udfFlush() {
        return this.#client.udfFlush();
    }

    async udfDelete(lib: string) {
        return this.#client.udfDelete(lib);
    }

    /**
     * Closes the client.
     */
    async close() {
        this.#graphs.clear();
        this.#schemas.clear();
        return this.#client.disconnect();
    }
}

export { FalkorDB };
