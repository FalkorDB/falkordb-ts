import { NetSocketOptions } from "./net-socket-options";
import { TlsSocketOptions } from "./tls-socket-options";

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
     * When the socket closes unexpectedly (without calling `.quit()`/`.disconnect()`), the client uses `reconnectStrategy` to decide what to do. The following values are supported:
     */
    tls?: boolean;
}

export type SocketOptions = SocketCommonOptions & (NetSocketOptions | TlsSocketOptions);
