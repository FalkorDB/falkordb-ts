import * as net from 'net';

export type NetSocketOptions = Partial<net.SocketConnectOpts> & {
    tls?: false;
};