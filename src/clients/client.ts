import { RedisCommandArgument } from "@redis/client/dist/lib/commands";
import { QueryOptions } from "../commands";
import { ConstraintType, EntityType, GraphReply } from "../graph";
import FalkorDB from "../falkordb";
import { SingleGraphConnection } from "./single";

// A generic client interface for Redis clients
export interface Client {
  init(falkordb: FalkorDB): Promise<void>;

  list(): Promise<Array<string>>;

  configGet(
    configKey: string
  ): Promise<(string | number)[] | (string | number)[][]>;

  configSet(configKey: string, value: number | string): Promise<void>;

  info(section?: string): Promise<(string | string[])[]>;

  query<T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact?: boolean
  ): Promise<any>;

  profile<T>(graph: string, query: RedisCommandArgument): Promise<any>;

  roQuery<T>(
    graph: string,
    query: RedisCommandArgument,
    options?: QueryOptions,
    compact?: boolean
  ): Promise<any>;

  copy<T>(srcGraph: string, destGraph: string): Promise<any>;

  delete(graph: string): Promise<void>;

  explain(graph: string, query: string): Promise<any>;

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

  /**
   * @deprecated Use `disconnect` instead
   */
  quit(): Promise<void>;

  disconnect(): Promise<void>;

  getConnection(): Promise<SingleGraphConnection>;
}
