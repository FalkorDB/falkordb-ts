
import * as tls from 'tls';
import * as net from 'net';
import { EventEmitter } from 'events';

import { RedisClientOptions, RedisDefaultModules, RedisFunctions, RedisScripts, createClient, createCluster } from 'redis';

import Graph, { GraphConnection } from './graph';
import commands from './commands';
import { RedisClientType, RedisClusterOptions } from '@redis/client';
import { Options as PoolOptions } from 'generic-pool';

type NetSocketOptions = Partial<net.SocketConnectOpts> & {
    tls?: false;
};

type TypedRedisClientOptions = RedisClientOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;
type TypedRedisClientType = RedisClientType<RedisDefaultModules & { falkordb: typeof commands }, RedisFunctions, RedisScripts>

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

function extractDetails(masters: Array<Array<string>>) {
    const allDetails: Record<string, string>[] = [];
    for (const master of masters) {
        const details: Record<string, string> = {};
        for (let i = 0; i < master.length; i += 2) {
            details[master[i]] = master[i + 1];
        }
        allDetails.push(details);
    }
    return allDetails;
}

export default class FalkorDB extends EventEmitter {

    #client: GraphConnection;
    #sentinel?: GraphConnection;

    private constructor(client: GraphConnection) {
        super();
        this.#client = client;
    }

    private async connectServer(client: TypedRedisClientType, redisOption: TypedRedisClientOptions) {

        // If not connected to sentinel, throws an error on missing command
        const masters = await client.falkordb.sentinelMasters();
        const details = extractDetails(masters);

        if (details.length > 1) {
            throw new Error('Multiple masters are not supported');
        }
        
        // Connect to the server with the details from sentinel
        const socketOptions: tls.ConnectionOptions = {
            ...redisOption.socket,
            host: details[0]['ip'] as string,
            port: parseInt(details[0]['port'])
        };
        const serverOptions: TypedRedisClientOptions = {
            ...redisOption,
            socket: socketOptions
        };
        const realClient = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(serverOptions)

        // Set original client as sentinel and server client as client
        this.#sentinel = client;
        this.#client = realClient;

        await realClient
            .on('error', async err => {

                console.debug('Error on server connection', err)

                // Disconnect the client to avoid further errors and retries
                realClient.disconnect();

                // If error occurs on previous server connection, no need to reconnect
                if (this.#client !== realClient) {
                    return;
                }

                try {
                    await this.connectServer(client, redisOption)
                    console.debug('Connected to server')
                } catch (e) {
                    console.debug('Error on server reconnect', e)

                    // Forward errors if reconnection fails
                    this.emit('error', err)
                }
            })
            .connect();
    }

    static async connect(options?: FalkorDBOptions) {
        const redisOption = (options ?? {}) as TypedRedisClientOptions;

        // If the URL is provided, and the protocol is `falkor` replaces it with `redis` for the underline redis client
        // e.g. falkor://localhost:6379 -> redis://localhost:6379
        if (redisOption.url && redisOption.url.startsWith('falkor')) {
            redisOption.url = redisOption.url.replace('falkor', 'redis');
        }

        // Just copy the pool options to the isolation pool options as expected by the redis client
        if(options?.poolOptions){
            redisOption.isolationPoolOptions = options.poolOptions;
        }

        redisOption.modules = {
            falkordb: commands
        }

        const client = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(redisOption)
        


        let falkordb = new FalkorDB(client);
        
        await client
        .on('error', err => falkordb.emit('error', err)) // Forward errors
        .connect();
        
        try {
            await client.clusterInfo()
            const clusterClient = createCluster((options ?? {}) as RedisClusterOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>)
            
            falkordb = new FalkorDB(clusterClient);
            
            await clusterClient
            .on('error', err => falkordb.emit('error', err)) // Forward errors
            .connect();
            
            return falkordb
        } catch (e) {
            
            console.debug('Error in connecting to cluster, connecting single server');
        }
        
        try {
            await falkordb.connectServer(client, redisOption)
        } catch (e) {
            console.debug('Error in connecting to sentinel, connecting to server directly');
        }
        
        return falkordb
    }

    selectGraph(graphId: string) {
        return new Graph(this.#client, graphId);
    }

    public get connection() {
        return this.#client;
    }

    async list() {
        return this.#client.falkordb.list()
    }

    async configGet(configKey: string) {
        return this.#client.falkordb.configGet(configKey)
    }

    async configSet(configKey: string, value: number) {
        return this.#client.falkordb.configSet(configKey, value)
    }

    async info(section?: string) {
        return this.#client.falkordb.info(section)
    }



    /**
     * Closes the client.
     */
    async close() {
        return this.#client.quit();
    }
}
