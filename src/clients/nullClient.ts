import { RedisCommandArgument } from "@redis/client/dist/lib/commands";
import { QueryOptions } from "../commands";
import FalkorDB from "../falkordb";
import { ConstraintType, EntityType } from "../graph";
import { Client } from "./client";
import { SingleGraphConnection } from "./single";

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
    init(falkordb: FalkorDB): Promise<void> {
        throw new Error("Method not implemented.");
    }
    list(): Promise<Array<string>> {
        throw new Error("Method not implemented.");
    }
    configGet(configKey: string): Promise<(string | number)[] | (string | number)[][]> {
        throw new Error("Method not implemented.");
    }
    configSet(configKey: string, value: number | string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    info(section?: string): Promise<(string | string[])[]> {
        throw new Error("Method not implemented.");
    }
    query<T>(graph: string, query: RedisCommandArgument, options?: QueryOptions): Promise<any> {
        throw new Error("Method not implemented.");
    }
    profile<T>(graph: string, query: RedisCommandArgument): Promise<any> {
        throw new Error("Method not implemented.");
    }
    roQuery<T>(graph: string, query: RedisCommandArgument, options?: QueryOptions): Promise<any> {
        throw new Error("Method not implemented.");
    }
    copy<T>(srcGraph: string, destGraph: string): Promise<any> {
        throw new Error("Method not implemented.");
    }
    delete(graph: string): Promise<void> {
        throw new Error("Method not implemented.");
    }
    explain(graph: string, query: string): Promise<any> {
        throw new Error("Method not implemented.");
    }
    slowLog(graph: string): Promise<{ timestamp: Date; command: string; query: string; took: number; }[]> {
        throw new Error("Method not implemented.");
    }
    constraintCreate(graph: string, constraintType: ConstraintType, entityType: EntityType, label: string, ...properties: string[]): Promise<void> {
        throw new Error("Method not implemented.");
    }
    constraintDrop(graph: string, constraintType: ConstraintType, entityType: EntityType, label: string, ...properties: string[]): Promise<void> {
        throw new Error("Method not implemented.");
    }
    quit(): Promise<void> {
        throw new Error("Method not implemented.");
    }
}