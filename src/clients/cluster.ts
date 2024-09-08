import { Client } from "./client";
import { ConstraintType, EntityType } from "../graph";
import { RedisCommandArgument, RedisFunctions, RedisScripts } from "@redis/client/dist/lib/commands";
import commands, { QueryOptions } from "../commands";
import { createCluster, RedisClusterType } from "@redis/client";
import FalkorDB, { TypedRedisClusterClientOptions } from "../falkordb";
import { SingleGraphConnection } from "./single";

export type ClusterGraphConnection = RedisClusterType<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;

export class Cluster implements Client {

    #client: ClusterGraphConnection;

    constructor(client: SingleGraphConnection) {
        const redisClusterOption = client.options as TypedRedisClusterClientOptions;
        client.disconnect();
        this.#client = createCluster<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(redisClusterOption)
    }

    async init(falkordb: FalkorDB) {
        await this.#client
            .on('error', err => falkordb.emit('error', err)) // Forward errors
            .connect();
    }

    async query<T>(graph: string, query: RedisCommandArgument, options?: QueryOptions) {


        return this.#client.falkordb.query(graph, query, options)

        // const slots = this.#client.slots
        // // let client = await this.#slots.getClient(firstKey, isReadonly);
        // const slot = calculateSlot(graph);

        // const client = this.#client.nodeClient(slots[slot].master);
        // if(client.)
        // new Single(client).query(graph, query, options)
    }
    async roQuery<T>(graph: string, query: RedisCommandArgument, options?: QueryOptions) {
        return this.#client.falkordb.roQuery(graph, query, options)
    }

    async delete(graph: string) {
        const reply = this.#client.falkordb.delete(graph)
        return reply.then(() => { })
    }

    async explain(graph: string, query: string) {
        return this.#client.falkordb.explain(graph, query)
    }

    async list(): Promise<Array<string>> {
        return this.#client.falkordb.list()
    }

    async configGet(configKey: string) {
        return this.#client.falkordb.configGet(configKey)
    }

    async configSet(configKey: string, value: number) {
        const reply = this.#client.falkordb.configSet(configKey, value)
        return reply.then(() => { })
    }

    async info(section?: string) {
        return this.#client.falkordb.info(section)
    }

    async copy<T>(srcGraph: string, destGraph: string) {
        return this.#client.falkordb.copy(srcGraph, destGraph)
    }

    slowLog(graph: string) {
        return this.#client.falkordb.slowLog(graph)
    }
    async constraintCreate(graph: string, constraintType: ConstraintType, entityType: EntityType, label: string, ...properties: string[]) {
        const reply = this.#client.falkordb.constraintCreate(
            graph,
            constraintType,
            entityType,
            label,
            ...properties
        )
        return reply.then(() => { })
    }

    async constraintDrop(graph: string, constraintType: ConstraintType, entityType: EntityType, label: string, ...properties: string[]) {
        const reply = this.#client.falkordb.constraintDrop(
            graph,
            constraintType,
            entityType,
            label,
            ...properties
        )
        return reply.then(() => { })
    }

    async profile<T>(graph: string, query: string) {
		return this.#client.falkordb.profile( graph, query)
    }

    async quit() {
        const reply = this.#client.quit();
		return reply.then(() => {})    
    }
}