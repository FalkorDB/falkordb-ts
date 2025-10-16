import { Client } from "./client";
import { ConstraintType, EntityType } from "../graph";
import {
  RedisCommandArgument,
  RedisFunctions,
  RedisScripts,
} from "@redis/client/dist/lib/commands";
import commands, { QueryOptions } from "../commands";
import { RedisClientType } from "@redis/client";
import FalkorDB from "../falkordb";
import { MemoryUsageOptions, MemoryUsageReply } from "../commands/MEMORY_USAGE";

export type SingleGraphConnection = RedisClientType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts
>;

export class Single implements Client {
  protected client: SingleGraphConnection;
  #usePool: boolean;

  constructor(client: SingleGraphConnection) {
    this.client = client;
    this.#usePool = !!this.client.options?.isolationPoolOptions;
  }

  init(_falkordb: FalkorDB) {
    return Promise.resolve();
  }

  async query<_T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact = true
  ) {
    const reply = this.#usePool
      ? await this.client.executeIsolated(async (isolatedClient) => {
          return isolatedClient.falkordb.query(graph, query, options, compact);
        })
      : await this.client.falkordb.query(graph, query, options, compact);

    return reply;
  }

  async roQuery<_T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact = true
  ) {
    const reply = this.#usePool
      ? await this.client.executeIsolated(async (isolatedClient) => {
          return isolatedClient.falkordb.roQuery(
            graph,
            query,
            options,
            compact
          );
        })
      : await this.client.falkordb.roQuery(graph, query, options, compact);

    return reply;
  }

  async delete(graph: string) {
    if (this.#usePool) {
      return this.client.executeIsolated(async (isolatedClient) => {
        const reply = isolatedClient.falkordb.delete(graph);
        return reply.then(() => {});
      });
    }
    const reply = this.client.falkordb.delete(graph);
    return reply.then(() => {});
  }

  async explain(graph: string, query: string) {
    if (this.#usePool) {
      return this.client.executeIsolated(async (isolatedClient) => {
        return isolatedClient.falkordb.explain(graph, query);
      });
    }
    return this.client.falkordb.explain(graph, query);
  }

  async profile<_T>(graph: string, query: string) {
    if (this.#usePool) {
      return this.client.executeIsolated(async (isolatedClient) => {
        return isolatedClient.falkordb.profile(graph, query);
      });
    }
    return this.client.falkordb.profile(graph, query);
  }

  async list() {
    return this.client.falkordb.list();
  }

  async configGet(configKey: string) {
    return this.client.falkordb.configGet(configKey);
  }

  async configSet(configKey: string, value: number | string) {
    const reply = this.client.falkordb.configSet(configKey, value);
    return reply.then(() => {});
  }

  async info(section?: string) {
    return this.client.falkordb.info(section);
  }

  async slowLog(graph: string) {
    if (this.#usePool) {
      return this.client.executeIsolated(async (isolatedClient) => {
        return isolatedClient.falkordb.slowLog(graph);
      });
    }
    return this.client.falkordb.slowLog(graph);
  }

  async memoryUsage(graph: string, options?: MemoryUsageOptions): Promise<MemoryUsageReply> {
    return this.client.falkordb.memoryUsage(graph, options)
  }

  async constraintCreate(
    graph: string,
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ) {
    const reply = this.client.falkordb.constraintCreate(
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
    const reply = this.client.falkordb.constraintDrop(
      graph,
      constraintType,
      entityType,
      label,
      ...properties
    );
    return reply.then(() => {});
  }

  async copy<_T>(srcGraph: string, destGraph: string) {
    return this.client.falkordb.copy(srcGraph, destGraph);
  }

  quit() {
    return this.disconnect();
  }

  async disconnect(): Promise<void> {
    const reply = this.client.disconnect();
    return reply.then(() => {});
  }

  async getConnection() {
    return this.client;
  }
}
