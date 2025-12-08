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
   * Whether to use TLS for this socket connection.
   * When `true`, TLS-specific options from {@link TlsSocketOptions} are expected;
   * when `false` or omitted, {@link NetSocketOptions} are used.
   */
  tls?: boolean;
}

export type SocketOptions = SocketCommonOptions &
  (NetSocketOptions | TlsSocketOptions);
