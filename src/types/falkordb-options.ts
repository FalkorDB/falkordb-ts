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
     * How integers in query results are returned. `'number'` rounds those
     * beyond `Number.MAX_SAFE_INTEGER` (2^53 - 1); `'bigint'` returns every
     * integer value exactly, as a `bigint`. Node and edge ids stay numbers.
     * Note that `JSON.stringify` throws on a `bigint`.
     * @default 'number'
     */
    integers?: 'number' | 'bigint';

    /**
     * Sentinel only. Resend write commands to the new master when the
     * connection is lost while waiting for their reply, e.g. during a master
     * hand-over. The old master may have already run them, so a write can be
     * applied twice. Read-only commands, and commands the server certainly did
     * not run (such as ones rejected with `READONLY`), are always resent.
     * @default false
     */
    retryWritesOnConnectionLoss?: boolean;

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
