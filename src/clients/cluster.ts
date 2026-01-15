import { Client } from "./client";
import { ConstraintType, EntityType } from "../graph";
import {
  RedisCommandArgument,
  RedisFunctions,
  RedisScripts,
} from "@redis/client/dist/lib/commands";
import commands, { QueryOptions } from "../commands";
import { createCluster, RedisClusterType } from "@redis/client";
import FalkorDB, { TypedRedisClusterClientOptions } from "../falkordb";
import { SingleGraphConnection } from "./single";
import { RedisClusterClientOptions } from "@redis/client/dist/lib/cluster";
import * as lodash from "lodash";
import { MemoryUsageOptions, MemoryUsageReply } from "../commands/MEMORY_USAGE";
import { UdfListReply } from "../commands/UDF_LIST";
export type ClusterGraphConnection = RedisClusterType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts
>;

/**
 * A client that connects to a Redis Cluster.
 */
export class Cluster implements Client {
  #client: ClusterGraphConnection;

  constructor(client: SingleGraphConnection) {
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
    client.disconnect();
    this.#client = createCluster<
      { falkordb: typeof commands },
      RedisFunctions,
      RedisScripts
    >(redisClusterOption);
  }

  async getConnection() {
    const connection = this.#client.nodeClient(this.#client.getRandomNode());
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
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact = true
  ) {
    return this.#client.falkordb.query(graph, query, options, compact);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async roQuery<T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact = true
  ) {
    return this.#client.falkordb.roQuery(graph, query, options, compact);
  }

  async delete(graph: string) {
    const reply = this.#client.falkordb.delete(graph);
    return reply.then(() => {});
  }

  async explain(graph: string, query: string) {
    return this.#client.falkordb.explain(graph, query);
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

  async configGet(configKey: string) {
    return this.#client.falkordb.configGet(configKey);
  }

  async configSet(configKey: string, value: number | string) {
    const reply = this.#client.falkordb.configSet(configKey, value);
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
    return this.#client.falkordb.udfLoad(name, script, replace);
  }

  async udfList(lib?: string, withCode: boolean = false): Promise<UdfListReply> {
    return this.#client.falkordb.udfList(lib, withCode) as Promise<UdfListReply>;
  }

  async udfFlush() {
    return this.#client.falkordb.udfFlush();
  }

  async udfDelete(lib: string) {
    return this.#client.falkordb.udfDelete(lib);
  }

  async profile<_T>(graph: string, query: string) {
    return this.#client.falkordb.profile(graph, query);
  }

  async quit() {
    return this.disconnect();
  }

  async disconnect(): Promise<void> {
    const reply = this.#client.disconnect();
    return reply.then(() => {});
  }
}
