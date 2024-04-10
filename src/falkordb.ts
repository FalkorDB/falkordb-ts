
import * as tls from 'tls';
import * as net from 'net';
import { EventEmitter } from 'events';

import { RedisClientOptions, RedisFunctions, RedisScripts, createClient } from 'redis';

import Graph, { GraphConnection } from './graph';
import commands from './commands';

type NetSocketOptions = Partial<net.SocketConnectOpts> & {
    tls?: false;
};

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
}

export default class FalkorDB extends EventEmitter {

    #client: GraphConnection;

    private constructor(client: GraphConnection) {
        super();
        this.#client = client;
    }

    static async connect(options?: FalkorDBOptions) {
        const redisOption = (options ?? {}) as RedisClientOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;

        // If the URL is provided, and the protocl is `falkor` replaces it with `redis` for the underline redis client
        // e.g. falkor://localhost:6379 -> redis://localhost:6379
        if (redisOption.url && redisOption.url.startsWith('falkor')) {
            redisOption.url = redisOption.url.replace('falkor', 'redis');
        }

        redisOption.modules = {
            falkordb: commands
        }

        const client = createClient<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>(redisOption)
        const falkordb = new FalkorDB(client);

        await client
            .on('error', err => falkordb.emit('error', err)) // Forward errors
            .connect();

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
