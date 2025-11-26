
import { EventEmitter } from 'events';

import { RedisFunctions, RedisScripts, createClient } from 'redis';

import Graph from './graph';
import { Client } from './clients/client';
import { Single } from './clients/single';
import { Sentinel } from './clients/sentinel';
import { Cluster } from './clients/cluster';
import { NullClient } from './clients/nullClient';
import { FalkorDBOptions, SingleGraphConnection, TypedRedisClientOptions } from './types'
import commands from './commands';

async function clientFactory(client: SingleGraphConnection) {

    const info = await client.info("server")

    if (info.includes("redis_mode:sentinel")) {
        return new Sentinel(client)
    } else if (info.includes("redis_mode:cluster")) {
        return new Cluster(client);
    }
    return new Single(client)
}

export default class FalkorDB extends EventEmitter {

    #client: Client = new NullClient();

    static async connect(options?: FalkorDBOptions) {
        const redisOption = (options ?? {}) as TypedRedisClientOptions;

        // If the URL is provided, and the protocol is `falkor` replaces it with `redis` for the underline redis client
        // e.g. falkor://localhost:6379 -> redis://localhost:6379
        if (redisOption.url && redisOption.url.startsWith('falkor')) {
            redisOption.url = redisOption.url.replace('falkor', 'redis');
        }

        // Just copy the pool options to the isolation pool options as expected by the redis client
        if (options?.poolOptions) {
            redisOption.isolationPoolOptions = options.poolOptions;
        }

        redisOption.modules = {
            falkordb: commands
        }

        // Create an empty FalkorDB instance for the redisClient on error event to work
        const falkordb = new FalkorDB();

        // Create initial redis single client
        const redisClient = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(redisOption)
        await redisClient
            .on('error', err => falkordb.emit('error', err)) // Forward errors
            .connect();

        // Create FalkorDB client wrapper
        const client = await clientFactory(redisClient);
        await client.init(falkordb);

        // Set the client to the FalkorDB instance after it was initialized
        falkordb.#client = client;  

        return falkordb
    }

    selectGraph(graphId: string) {
        return new Graph(this.#client, graphId);
    }

    public get connection() {
        return this.#client.getConnection();
    }

    async list() {
        return this.#client.list()
    }

    async configGet(configKey: string) {
        return this.#client.configGet(configKey)
    }

    async configSet(configKey: string, value: number | string) {
        return this.#client.configSet(configKey, value)
    }

    async info(section?: string) {
        return this.#client.info(section)
    }

    /**
     * Closes the client.
     */
    async close() {
        return this.#client.disconnect();
    }
}
