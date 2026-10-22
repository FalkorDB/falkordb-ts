import { Client } from "./client";
import { ConstraintType, EntityType } from "../enums";
import {
  RedisArgument,
  RedisFunctions,
  RedisScripts,
} from "@redis/client";
import commands from "../commands";
import * as RO_QUERY from "../commands/RO_QUERY";
import { createCluster } from "@redis/client";
import FalkorDB from "../falkordb";
import { RedisClusterClientOptions } from "@redis/client/dist/lib/cluster";
import * as lodash from "lodash";
import type {
  ClusterGraphConnection,
  MemoryUsageOptions,
  MemoryUsageReply,
  PlanOptions,
  QueryOptions,
  SingleGraphConnection,
  TypedRedisClusterClientOptions,
  UdfListReply,
} from "../types";

export type { ClusterGraphConnection };

export interface ClusterOptions {
  /**
   * Serve read-only commands (e.g. `GRAPH.RO_QUERY`) from replicas as well as
   * masters. Replica connections are sent
   * [`READONLY`](https://redis.io/docs/latest/commands/readonly/) so they
   * answer reads instead of redirecting them; writes still go to the masters.
   */
  useReplicas?: boolean;
}

/**
 * A client that connects to a Redis Cluster.
 */
export class Cluster implements Client {
  #client: ClusterGraphConnection;

  constructor(client: SingleGraphConnection, { useReplicas = false }: ClusterOptions = {}) {
    // Convert the single client options to a cluster client options
    const redisClusterOption = client.options as TypedRedisClusterClientOptions;
    redisClusterOption.rootNodes = [
      client.options as RedisClusterClientOptions,
    ];

    // Remove the URL from the defaults so it won't override the dynamic cluster URLs
    const defaults = lodash.cloneDeep(client.options);
    defaults?.url && delete defaults.url;

    redisClusterOption.defaults = defaults;
    redisClusterOption.maxCommandRedirections = 100000;
    redisClusterOption.useReplicas = useReplicas;
    client.disconnect();
    this.#client = createCluster<
      { falkordb: typeof commands },
      RedisFunctions,
      RedisScripts,
      2
    >(redisClusterOption);
  }

  async getConnection() {
    return this.#masterClient();
  }

  // Keyless commands are routed to a random node, which can be a replica when
  // `useReplicas` is on, so writes without a key are sent to a master instead.
  async #masterClient() {
    const { masters } = this.#client;
    const master = masters[Math.floor(Math.random() * masters.length)];
    const connection = this.#client.nodeClient(master);
    return connection instanceof Promise ? await connection : connection;
  }

  async init(falkordb: FalkorDB) {
    await this.#client
      .on("error", (err) => falkordb.emit("error", err)) // Forward errors
      .connect();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async query<T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact = true,
    version?: number
  ) {
    return this.#client.falkordb.query(graph, query, options, compact, version);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async roQuery<T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact = true,
    version?: number,
    primary = false
  ) {
    if (primary) {
      // Still GRAPH.RO_QUERY, so read-only users can run it, but routed to the
      // slot's master as a write would be
      const args = RO_QUERY.transformArguments(graph, query, options, compact, version);
      return RO_QUERY.transformReply(await this.#client.sendCommand(graph, false, args));
    }
    return this.#client.falkordb.roQuery(graph, query, options, compact, version);
  }

  async delete(graph: string) {
    const reply = this.#client.falkordb.delete(graph);
    return reply.then(() => {});
  }

  async explain(graph: string, query: string, options?: PlanOptions) {
    return this.#client.falkordb.explain(graph, query, options);
  }

  async list(): Promise<Array<string>> {
    const reply = await Promise.all(
      this.#client.masters.map(async (master) => {
        return (await this.#client.nodeClient(master)).falkordb.list();
      })
    );
    const [result, errors] = [
      reply.filter((r) => !(r instanceof Error)).flat(),
      reply.filter((r) => r instanceof Error),
    ];

    if (errors.length > 0) {
      console.error("Some nodes failed to respond:", errors);
    }

    return result;
  }

  async stubs(): Promise<Array<string>> {
    const replies = await Promise.allSettled(
      this.#client.masters.map(async (master) => {
        return (await this.#client.nodeClient(master)).falkordb.stubs();
      })
    );

    const result: Array<string> = [];
    const errors: Array<unknown> = [];
    for (const reply of replies) {
      if (reply.status === "fulfilled") {
        result.push(...reply.value);
      } else {
        errors.push(reply.reason);
      }
    }

    // Only surface a failure when every master failed - e.g. when the
    // graph-offloading module is missing cluster-wide ("unknown command").
    if (errors.length > 0 && errors.length === replies.length) {
      throw errors[0];
    }

    if (errors.length > 0) {
      console.error("Some nodes failed to respond:", errors);
    }

    return result;
  }

  async configGet(configKey: string) {
    return this.#client.falkordb.configGet(configKey);
  }

  async configSet(configKey: string, value: number | string) {
    const reply = (await this.#masterClient()).falkordb.configSet(configKey, value);
    return reply.then(() => {});
  }

  async info(section?: string) {
    return this.#client.falkordb.info(section);
  }

  async copy<_T>(srcGraph: string, destGraph: string) {
    return this.#client.falkordb.copy(srcGraph, destGraph);
  }

  slowLog(graph: string) {
    return this.#client.falkordb.slowLog(graph);
  }

  async memoryUsage(
    graph: string,
    options?: MemoryUsageOptions
  ): Promise<MemoryUsageReply> {
    return this.#client.falkordb.memoryUsage(graph, options);
  }

  async constraintCreate(
    graph: string,
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ) {
    const reply = this.#client.falkordb.constraintCreate(
      graph,
      constraintType,
      entityType,
      label,
      ...properties
    );
    return reply.then(() => {});
  }

  async constraintDrop(
    graph: string,
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ) {
    const reply = this.#client.falkordb.constraintDrop(
      graph,
      constraintType,
      entityType,
      label,
      ...properties
    );
    return reply.then(() => {});
  }

  async udfLoad(name: string, script: string | Function, replace: boolean = false) {
    return (await this.#masterClient()).falkordb.udfLoad(name, script, replace);
  }

  async udfList(lib?: string, withCode: boolean = false): Promise<UdfListReply> {
    return this.#client.falkordb.udfList(lib, withCode) as Promise<UdfListReply>;
  }

  async udfFlush() {
    return (await this.#masterClient()).falkordb.udfFlush();
  }

  async udfDelete(lib: string) {
    return (await this.#masterClient()).falkordb.udfDelete(lib);
  }

  async profile<_T>(graph: string, query: string, options?: PlanOptions) {
    return this.#client.falkordb.profile(graph, query, options);
  }

  async quit() {
    return this.disconnect();
  }

  async disconnect(): Promise<void> {
    const reply = this.#client.disconnect();
    return reply.then(() => {});
  }
}
