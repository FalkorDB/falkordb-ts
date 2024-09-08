
import * as tls from 'tls';
import * as net from 'net';
import { EventEmitter } from 'events';

import { RedisClientOptions, RedisFunctions, RedisScripts, createClient, createCluster } from 'redis';

import Graph from './graph';
import commands from './commands';
import { RedisClusterOptions } from '@redis/client';
import { Options as PoolOptions } from 'generic-pool';
import { Client } from './clients/client';
import { Single, SingleGraphConnection } from './clients/single';
import { Sentinel } from './clients/sentinel';
import { Cluster } from './clients/cluster';
import { NullClient } from './clients/nullClient';


type NetSocketOptions = Partial<net.SocketConnectOpts> & {
    tls?: false;
};

export type TypedRedisClientOptions = RedisClientOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;
export type TypedRedisClusterClientOptions = RedisClusterOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;

interface TlsSocketOptions extends tls.ConnectionOptions {
    tls: true;
}

interface SocketCommonOptions {

    /**
     * Connection Timeout (in milliseconds)
     */
    connectTimeout?: number;

    /**
     * Toggle [`Nagle's algorithm`](https://nodejs.org/api/net.html#net_socket_setnodelay_nodelay)
     */
    noDelay?: boolean;

    /**
     * Toggle [`keep-alive`](https://nodejs.org/api/net.html#net_socket_setkeepalive_enable_initialdelay)
     */
    keepAlive?: number | false;


    /**
     * When the socket closes unexpectedly (without calling `.quit()`/`.disconnect()`), the client uses `reconnectStrategy` to decide what to do. The following values are supported:
     */
    tls?: boolean;
}

export type SocketOptions = SocketCommonOptions & (NetSocketOptions | TlsSocketOptions);

export interface FalkorDBOptions {

    /**
     * `falkor[s]://[[username][:password]@][host][:port][/db-number]`
     */
    url?: string;

    /**
     * Socket connection properties
     */
    socket?: SocketOptions;

    /**
     * ACL username ([see ACL guide](https://redis.io/topics/acl))
     */
    username?: string;

    /**
     * ACL password or the old "--requirepass" password
     */
    password?: string;

    /**
     * Client name ([see `CLIENT SETNAME`](https://redis.io/commands/client-setname))
     */
    name?: string;

    /**
     * Connect in [`READONLY`](https://redis.io/commands/readonly) mode
     */
    readonly?: boolean;

    /**
     * Send `PING` command at interval (in ms).
     * Useful with Redis deployments that do not use TCP Keep-Alive.
     */
    pingInterval?: number;

    /**
     * If set to true, disables sending client identifier (user-agent like message) to the redis server
     */
    disableClientInfo?: boolean;

    /**
     * Tag to append to library name that is sent to the Redis server
     */
    clientInfoTag?: string;

    /**
     * Connection pool options 
     */
    poolOptions?: PoolOptions;
}

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


        // verify if it's connected to shard that is part of a cluster
        // if(await isCluster(client)){
        //     client.disconnect();

        //     const redisClusterOption = redisOption as TypedRedisClusterClientOptions;
        //     const clusterClient = createCluster<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(redisClusterOption)

        //     falkordb = new FalkorDB(clusterClient);

        //     await clusterClient
        //     .on('error', err => falkordb.emit('error', err)) // Forward errors
        //     .connect();

        //     return falkordb
        // }

        return falkordb
    }

    selectGraph(graphId: string) {
        return new Graph(this.#client, graphId);
    }

    public get connection() {
        return this.#client;
    }

    async list() {
        return this.#client.list()
    }

    async configGet(configKey: string) {
        return this.#client.configGet(configKey)
    }

    async configSet(configKey: string, value: number) {
        return this.#client.configSet(configKey, value)
    }

    async info(section?: string) {
        return this.#client.info(section)
    }

    /**
     * Closes the client.
     */
    async close() {
        return this.#client.quit();
    }
}
