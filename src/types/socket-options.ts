import type { NetSocketOptions } from './net-socket-options';
import type { TlsSocketOptions } from './tls-socket-options';

export interface SocketCommonOptions {

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
     * When the socket closes unexpectedly (without calling `.close()`), the client uses `reconnectStrategy` to decide what to do:
     * 1. `false` -> do not reconnect, close the client and flush the command queue.
     * 2. `number` -> wait for `X` milliseconds before reconnecting.
     * 3. `(retries, cause) => false | number | Error` -> `number` is the same as configuring a `number` directly, `Error` is the same as `false`, but with a custom error.
     *
     * By default the initial connection is retried 3 times before `FalkorDB.connect()` rejects,
     * and reconnects after that back off exponentially without a limit.
     */
    reconnectStrategy?: false | number | ((retries: number, cause: Error) => false | Error | number);

    /**
     * Timeout (in milliseconds) after which an idle socket is closed. `undefined` means no timeout.
     */
    socketTimeout?: number;

    /**
     * Whether to use TLS for this socket connection.
     * When `true`, TLS-specific options from {@link TlsSocketOptions} are expected;
     * when `false` or omitted, {@link NetSocketOptions} are used.
     */
    tls?: boolean;
}

export type SocketOptions = SocketCommonOptions & (NetSocketOptions | TlsSocketOptions);
