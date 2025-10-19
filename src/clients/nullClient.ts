import { RedisCommandArgument } from "@redis/client/dist/lib/commands";
import { QueryOptions } from "../commands";
import FalkorDB from "../falkordb";
import { ConstraintType, EntityType } from "../graph";
import { Client } from "./client";
import { SingleGraphConnection } from "./single";
import { MemoryUsageOptions, MemoryUsageReply } from "../commands/MEMORY_USAGE";

/**
 * The `NullClient` class is a placeholder implementation of the `Client` interface.
 * 
 * This class is designed to be used in scenarios where a client is required, but no actual
 * implementation is available. All methods in this class throw a "Method not implemented."
 * error, indicating that the functionality has not been provided.
 * 
 * The `NullClient` can serve as a base class or a stub for future implementations, or as a
 * fallback in cases where a functional client is not needed or cannot be instantiated.
 * 
 */
export class NullClient implements Client {

  getConnection(): Promise<SingleGraphConnection> {
      throw new Error("Method not implemented.");
  }
  init(_falkordb: FalkorDB): Promise<void> {
      throw new Error("Method not implemented.");
  }
  list(): Promise<Array<string>> {
      throw new Error("Method not implemented.");
  }
  configGet(_configKey: string): Promise<(string | number)[] | (string | number)[][]> {
      throw new Error("Method not implemented.");
  }
  configSet(_configKey: string, _value: number | string): Promise<void> {
      throw new Error("Method not implemented.");
  }
  info(_section?: string): Promise<(string | string[])[]> {
      throw new Error("Method not implemented.");
  }
  query<_T>(_graph: string, _query: RedisCommandArgument, _options?: QueryOptions): Promise<any> {
      throw new Error("Method not implemented.");
  }
  profile<_T>(_graph: string, _query: RedisCommandArgument): Promise<any> {
      throw new Error("Method not implemented.");
  }
  roQuery<_T>(_graph: string, _query: RedisCommandArgument, _options?: QueryOptions): Promise<any> {
      throw new Error("Method not implemented.");
  }
  copy<_T>(_srcGraph: string, _destGraph: string): Promise<any> {
      throw new Error("Method not implemented.");
  }
  delete(_graph: string): Promise<void> {
      throw new Error("Method not implemented.");
  }
  explain(_graph: string, _query: string): Promise<any> {
      throw new Error("Method not implemented.");
  }
  slowLog(
    _graph: string
  ): Promise<
    { timestamp: Date; command: string; query: string; took: number }[]
  > {
    throw new Error("Method not implemented.");
  }
  memoryUsage(
    _graph: string,
    _options?: MemoryUsageOptions
  ): Promise<MemoryUsageReply> {
    throw new Error("Method not implemented.");
  }
  constraintCreate(
    _graph: string,
    _constraintType: ConstraintType,
    _entityType: EntityType,
    _label: string,
    ..._properties: string[]
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  constraintDrop(
    _graph: string,
    _constraintType: ConstraintType,
    _entityType: EntityType,
    _label: string,
    ..._properties: string[]
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  quit(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
