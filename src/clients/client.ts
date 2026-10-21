import { RedisArgument } from "@redis/client";
import { ConstraintType, EntityType } from "../enums";
import FalkorDB from "../falkordb";
import type {
  MemoryUsageOptions,
  MemoryUsageReply,
  QueryOptions,
  SingleGraphConnection,
  SlowLogReply,
  UdfListReply,
} from "../types";

// A generic client interface for Redis clients
export interface Client {
  init(falkordb: FalkorDB): Promise<void>;

  list(): Promise<Array<string>>;

  /**
   * Lists the graphs that are currently offloaded to disk ("stubs").
   *
   * `GRAPH.STUBS` is provided by the FalkorDB Enterprise graph-offloading
   * module, so it rejects with an "unknown command" error on deployments where
   * that module is not loaded.
   */
  stubs(): Promise<Array<string>>;

  configGet(
    configKey: string
  ): Promise<(string | number)[] | (string | number)[][]>;

  configSet(configKey: string, value: number | string): Promise<void>;

  info(section?: string): Promise<(string | string[])[]>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  query<T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact?: boolean,
    version?: number
  ): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  profile<T>(graph: string, query: RedisArgument): Promise<any>;

  /**
   * @param primary Run on the graph's master even where reads may be served
   * by replicas, for a reply that must be at least as new as the master's
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  roQuery<T>(
    graph: string,
    query: RedisArgument,
    options?: QueryOptions,
    compact?: boolean,
    version?: number,
    primary?: boolean
  ): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  copy<T>(srcGraph: string, destGraph: string): Promise<any>;

  delete(graph: string): Promise<void>;

  explain(graph: string, query: string): Promise<any>;

  memoryUsage(
    graph: string,
    options?: MemoryUsageOptions
  ): Promise<MemoryUsageReply>;

  slowLog(graph: string): Promise<SlowLogReply>;

  constraintCreate(
    graph: string,
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ): Promise<void>;

  constraintDrop(
    graph: string,
    constraintType: ConstraintType,
    entityType: EntityType,
    label: string,
    ...properties: string[]
  ): Promise<void>;

  udfLoad(
    name: string,
    script: string | Function,
    replace?: boolean
  ): Promise<string>;

  udfList(
    lib?: string,
    withCode?: boolean
  ): Promise<UdfListReply>;

  udfFlush(): Promise<string>;

  udfDelete(lib: string): Promise<string>;

  /**
   * @deprecated Use `disconnect` instead
   */
  quit(): Promise<void>;

  disconnect(): Promise<void>;

  getConnection(): Promise<SingleGraphConnection>;
}
