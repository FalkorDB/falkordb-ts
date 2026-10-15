import type { SocketOptions } from './socket-options';

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
     * Server hostname, shorthand for `socket.host`.
     * Ignored when `url` or `socket.host` is provided.
     */
    host?: string;

    /**
     * Server port, shorthand for `socket.port`.
     * Ignored when `url` or `socket.port` is provided.
     */
    port?: number;

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
     * RESP protocol version. Only RESP 2 is supported: under RESP 3 node-redis rewrites
     * module map replies into objects, which does not match the reply shapes this client
     * parses and publishes types for. Passing anything else throws.
     */
    RESP?: 2;
}
