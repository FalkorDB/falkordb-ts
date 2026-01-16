import { RedisCommandArgument } from "@redis/client/dist/lib/commands";
import { QueryOptions } from "../commands";
import { ConstraintType, EntityType } from "../graph";
import FalkorDB from "../falkordb";
import { SingleGraphConnection } from "./single";
import { MemoryUsageOptions, MemoryUsageReply } from "../commands/MEMORY_USAGE";
import { UdfListReply } from "../commands/UDF_LIST";

// A generic client interface for Redis clients
export interface Client {
  init(falkordb: FalkorDB): Promise<void>;

  list(): Promise<Array<string>>;

  configGet(
    configKey: string
  ): Promise<(string | number)[] | (string | number)[][]>;

  configSet(configKey: string, value: number | string): Promise<void>;

  info(section?: string): Promise<(string | string[])[]>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  query<T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact?: boolean
  ): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  profile<T>(graph: string, query: RedisCommandArgument): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  roQuery<T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact?: boolean
  ): Promise<any>;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  copy<T>(srcGraph: string, destGraph: string): Promise<any>;

  delete(graph: string): Promise<void>;

  explain(graph: string, query: string): Promise<any>;

  memoryUsage(
    graph: string,
    options?: MemoryUsageOptions
  ): Promise<MemoryUsageReply>;

  slowLog(graph: string): Promise<
    {
      timestamp: Date;
      command: string;
      query: string;
      took: number;
    }[]
  >;

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
