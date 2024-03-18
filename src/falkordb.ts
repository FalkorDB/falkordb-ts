
import * as tls from 'tls';
import * as net from 'net';

import { RedisClientOptions, RedisFunctions, RedisScripts, createClient } from 'redis';

import Graph, { GraphClientType } from './graph';
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
     * `falkordb[s]://[[username][:password]@][host][:port][/db-number]`
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

export default class FalkorDB {

    #client: GraphClientType;

    private constructor(client: GraphClientType) {
        this.#client = client;
    }

    static async connect(options?: FalkorDBOptions) {
        const redisOption = (options?? {}) as RedisClientOptions<{falkordb: typeof commands}, RedisFunctions, RedisScripts>;
        
        redisOption.modules = {
            falkordb : commands
        }

        const client: GraphClientType = await createClient<{falkordb: typeof commands}, RedisFunctions, RedisScripts>(redisOption)
            .on('error', err => console.log('Redis Client Error', err))
            .connect();

        return new FalkorDB(client)
    }
    

    selectGraph(graphId: string) {
        return new Graph(this.#client, graphId);
    }
    
    async list() {
		return this.#client.falkordb.list()
	}

    async configGet(configKey: string) {
		return this.#client.falkordb.configGet(configKey)
	}

    async configSet(configKey: string, value: number) {
		return  this.#client.falkordb.configSet(configKey, value)
	}

    async info(section?: string) {
		return  this.#client.falkordb.info(section)
	}

    /**
     * Closes the client.
     */
    async close() {
        return this.#client.quit();
    }
}