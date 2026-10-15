import { RedisArgument } from "@redis/client";
import { QueryOptions } from "../commands";
import FalkorDB from "../falkordb";
import { ConstraintType, EntityType } from "../graph";
import { Client } from "./client";
import { SingleGraphConnection } from "./single";
import { MemoryUsageOptions, MemoryUsageReply } from "../commands/MEMORY_USAGE";
import { UdfListReply } from "../commands/UDF_LIST";

function readOnlyError(operation: string) {
  return new Error(`${operation} is not allowed on a read-only connection`);
}

/**
 * Wraps a `Client` so that it can only read, regardless of the permissions of
 * the user it is authenticated as.
 *
 * Queries are sent as `GRAPH.RO_QUERY`, so the server rejects any query that
 * writes. Commands that modify the server (deleting or copying graphs,
 * constraints, configuration, UDFs) are rejected without being sent, and so is
 * `GRAPH.PROFILE`, because it executes the query it profiles.
 */
export class ReadOnly implements Client {
  #client: Client;

  constructor(client: Client) {
    this.#client = client;
  }

  getConnection(): Promise<SingleGraphConnection> {
    return this.#client.getConnection();
  }

  init(falkordb: FalkorDB): Promise<void> {
    return this.#client.init(falkordb);
  }

  list(): Promise<Array<string>> {
    return this.#client.list();
  }

  stubs(): Promise<Array<string>> {
    return this.#client.stubs();
  }

  configGet(configKey: string) {
    return this.#client.configGet(configKey);
  }

  async configSet(_configKey: string, _value: number | string): Promise<void> {
    throw readOnlyError("GRAPH.CONFIG SET");
  }

  info(section?: string) {
    return this.#client.info(section);
  }

  query<T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact?: boolean
  ): Promise<any> {
    return this.#client.roQuery<T>(graph, query, options, compact);
  }

  async profile<_T>(_graph: string, _query: RedisArgument): Promise<any> {
    throw readOnlyError("GRAPH.PROFILE");
  }

  roQuery<T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact?: boolean
  ): Promise<any> {
    return this.#client.roQuery<T>(graph, query, options, compact);
  }

  async copy<_T>(_srcGraph: string, _destGraph: string): Promise<any> {
    throw readOnlyError("GRAPH.COPY");
  }

  async delete(_graph: string): Promise<void> {
    throw readOnlyError("GRAPH.DELETE");
  }

  explain(graph: string, query: string): Promise<any> {
    return this.#client.explain(graph, query);
  }

  slowLog(graph: string) {
    return this.#client.slowLog(graph);
  }

  memoryUsage(
    graph: string,
    options?: MemoryUsageOptions
  ): Promise<MemoryUsageReply> {
    return this.#client.memoryUsage(graph, options);
  }

  async constraintCreate(
    _graph: string,
    _constraintType: ConstraintType,
    _entityType: EntityType,
    _label: string,
    ..._properties: string[]
  ): Promise<void> {
    throw readOnlyError("GRAPH.CONSTRAINT CREATE");
  }

  async constraintDrop(
    _graph: string,
    _constraintType: ConstraintType,
    _entityType: EntityType,
    _label: string,
    ..._properties: string[]
  ): Promise<void> {
    throw readOnlyError("GRAPH.CONSTRAINT DROP");
  }

  async udfLoad(
    _name: string,
    _script: string | Function,
    _replace?: boolean
  ): Promise<string> {
    throw readOnlyError("GRAPH.UDF LOAD");
  }

  udfList(lib?: string, withCode?: boolean): Promise<UdfListReply> {
    return this.#client.udfList(lib, withCode);
  }

  async udfFlush(): Promise<string> {
    throw readOnlyError("GRAPH.UDF FLUSH");
  }

  async udfDelete(_lib: string): Promise<string> {
    throw readOnlyError("GRAPH.UDF DELETE");
  }

  quit(): Promise<void> {
    return this.#client.quit();
  }

  disconnect(): Promise<void> {
    return this.#client.disconnect();
  }
}
