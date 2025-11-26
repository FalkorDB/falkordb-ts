import * as tls from 'tls';

export interface TlsSocketOptions extends tls.ConnectionOptions {
    tls: true;
}