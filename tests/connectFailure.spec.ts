import { describe, it, expect, afterEach } from '@jest/globals';
import * as net from 'net';
import FalkorDB from '../src/falkordb';

const FALKORDB_HOST = process.env.FALKORDB_HOST || 'localhost';
const FALKORDB_PORT = parseInt(process.env.FALKORDB_PORT || '6379', 10);

/**
 * Starts a TCP server on a free port. `onConnection` decides what each
 * accepted socket gets; the server and its sockets are closed after the test.
 */
const servers: net.Server[] = [];
const accepted: net.Socket[] = [];
async function listen(onConnection: (socket: net.Socket, index: number) => void): Promise<number> {
    let index = 0;
    const server = net.createServer(socket => {
        accepted.push(socket);
        onConnection(socket, index++);
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return (server.address() as net.AddressInfo).port;
}

afterEach(async () => {
    // `close()` waits for open connections, so drop the ones a test left open.
    accepted.splice(0).forEach(socket => socket.destroy());
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

    it('does not retry the initial connection after a socket timeout', async () => {
        // Accept and never answer, so the socket goes idle during the handshake.
        let attempts = 0;
        const port = await listen(() => { attempts++; });

        await expect(FalkorDB.connect({ socket: { host: '127.0.0.1', port, socketTimeout: 100 } }))
            .rejects.toThrow(/timeout/i);
        expect(attempts).toBe(1);
    });

    it('reconnects and reports the error once connected', async () => {
        const sockets: net.Socket[] = [];
        const port = await listen(socket => {
            sockets.push(socket);
            const upstream = net.connect(FALKORDB_PORT, FALKORDB_HOST);
            socket.pipe(upstream).pipe(socket);
            socket.on('error', () => upstream.destroy());
            upstream.on('error', () => socket.destroy());
            socket.on('close', () => upstream.destroy());
        });

        const db = await FalkorDB.connect({ socket: { host: '127.0.0.1', port } });
        try {
            const errors: Error[] = [];
            db.on('error', (err: Error) => errors.push(err));

            sockets.forEach(socket => socket.destroy());
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(errors.length).toBeGreaterThan(0);
            const result = await db.selectGraph('connect-failure-reconnect').query<{ x: number }>('RETURN 1 AS x');
            expect(result.data).toEqual([{ x: 1 }]);
            expect(sockets.length).toBeGreaterThan(1);
        } finally {
            await db.close();
        }
    });
});
