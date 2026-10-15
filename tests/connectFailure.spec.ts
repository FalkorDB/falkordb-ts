import { describe, it, expect, afterEach } from '@jest/globals';
import * as net from 'net';
import FalkorDB from '../src/falkordb';

const FALKORDB_HOST = process.env.FALKORDB_HOST || 'localhost';
const FALKORDB_PORT = parseInt(process.env.FALKORDB_PORT || '6379', 10);

/**
 * Starts a TCP server on a free port. `onConnection` decides what each
 * accepted socket gets; the server is closed after the test.
 */
const servers: net.Server[] = [];
async function listen(onConnection: (socket: net.Socket, index: number) => void): Promise<number> {
    let index = 0;
    const server = net.createServer(socket => onConnection(socket, index++));
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return (server.address() as net.AddressInfo).port;
}

afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

describe('FalkorDB.connect failures', () => {
    // A TLS server drops a plain-text client as soon as the handshake fails,
    // which is exactly what a server that closes every socket looks like.
    it('rejects instead of hanging when the server keeps closing the socket', async () => {
        let attempts = 0;
        const port = await listen(socket => {
            attempts++;
            socket.destroy();
        });

        await expect(FalkorDB.connect({ socket: { host: '127.0.0.1', port } }))
            .rejects.toThrow(/Socket closed unexpectedly.*requires TLS/);
        // The first attempt plus the initial retries.
        expect(attempts).toBe(4);
    });

    it('does not suggest TLS when TLS is already enabled', async () => {
        const port = await listen(socket => socket.destroy());

        const error = await FalkorDB.connect({ url: `rediss://127.0.0.1:${port}` })
            .then(() => undefined, (err: Error) => err);
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toMatch(/^Failed to connect to FalkorDB/);
        expect(error?.message).not.toMatch(/requires TLS/);
    });

    it('rejects when nothing listens on the port', async () => {
        const port = await listen(() => undefined);
        await new Promise(resolve => servers.pop()!.close(resolve));

        await expect(FalkorDB.connect({ socket: { host: '127.0.0.1', port } }))
            .rejects.toThrow(/Failed to connect to FalkorDB: .*ECONNREFUSED/);
    });

    it('honours a reconnectStrategy chosen by the caller', async () => {
        const port = await listen(socket => socket.destroy());
        const calls: number[] = [];

        await expect(FalkorDB.connect({
            socket: {
                host: '127.0.0.1',
                port,
                reconnectStrategy: retries => {
                    calls.push(retries);
                    return retries < 5 ? 10 : new Error('caller gave up');
                },
            },
        })).rejects.toThrow('caller gave up');
        expect(calls).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('still connects when the first attempts are dropped', async () => {
        // Drop the first two connections, then proxy to the real server.
        const port = await listen((socket, index) => {
            if (index < 2) {
                socket.destroy();
                return;
            }
            const upstream = net.connect(FALKORDB_PORT, FALKORDB_HOST);
            socket.pipe(upstream).pipe(socket);
            socket.on('error', () => upstream.destroy());
            upstream.on('error', () => socket.destroy());
            socket.on('close', () => upstream.destroy());
        });

        const db = await FalkorDB.connect({ socket: { host: '127.0.0.1', port } });
        try {
            const result = await db.selectGraph('connect-failure-retry').query<{ x: number }>('RETURN 1 AS x');
            expect(result.data).toEqual([{ x: 1 }]);
        } finally {
            await db.close();
        }
    });
});
