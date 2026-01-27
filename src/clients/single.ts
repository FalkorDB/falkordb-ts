import { Client } from "./client";
import { ConstraintType, EntityType } from "../graph";
import {
  RedisArgument,
  RedisFunctions,
  RedisScripts,
} from "@redis/client";
import commands, { QueryOptions } from "../commands";
import { RedisClientType } from "@redis/client";
import FalkorDB from "../falkordb";
import { MemoryUsageOptions, MemoryUsageReply } from "../commands/MEMORY_USAGE";
import { UdfListReply } from "../commands/UDF_LIST";

export type SingleGraphConnection = RedisClientType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts,
  2
>;

export class Single implements Client {
  protected client: SingleGraphConnection;

  constructor(client: SingleGraphConnection) {
    this.client = client;
  }

  init(_falkordb: FalkorDB) {
    return Promise.resolve();
  }

  async query<_T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact = true
  ) {
    return await this.client.falkordb.query(graph, query, options, compact);
  }

  async roQuery<_T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact = true
  ) {
    return await this.client.falkordb.roQuery(graph, query, options, compact);
  }

  async delete(graph: string) {
    const reply = this.client.falkordb.delete(graph);
    return reply.then(() => {});
  }

  async explain(graph: string, query: string) {
    return this.client.falkordb.explain(graph, query);
  }

  async profile<_T>(graph: string, query: string) {
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
    return this.client.falkordb.slowLog(graph);
  }

  async memoryUsage(
    graph: string,
    options?: MemoryUsageOptions
  ): Promise<MemoryUsageReply> {
    return this.client.falkordb.memoryUsage(graph, options);
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

  async udfLoad(name: string, script: string | Function, replace: boolean = false) {
    return this.client.falkordb.udfLoad(name, script, replace);
  }

  async udfList(lib?: string, withCode: boolean = false): Promise<UdfListReply> {
    return this.client.falkordb.udfList(lib, withCode) as Promise<UdfListReply>;
  }

  async udfFlush() {
    return this.client.falkordb.udfFlush();
  }

  async udfDelete(lib: string) {
    return this.client.falkordb.udfDelete(lib);
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
