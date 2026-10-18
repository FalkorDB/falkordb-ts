import { jest, describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import {
    DisconnectsClientError,
    ErrorReply,
    SocketClosedUnexpectedlyError,
} from '@redis/client';
import * as net from 'net';
import FalkorDB from '../src/falkordb';
import { Sentinel, type SentinelOptions } from '../src/clients/sentinel';
import commands from '../src/commands';

type FakeClient = {
    name: string;
    destroy: jest.Mock;
    disconnect: jest.Mock;
    falkordb: { list: jest.Mock; query: jest.Mock };
};

function fakeClient(name: string, reply: () => Promise<unknown>): FakeClient {
    return {
        name,
        destroy: jest.fn(),
        disconnect: jest.fn(() => Promise.resolve()),
        falkordb: { list: jest.fn(reply), query: jest.fn(reply) },
    };
}

/**
 * Builds a Sentinel whose master connection is `oldMaster`, with master
 * re-discovery stubbed to switch to `newMasters` in order (an Error fails
 * that attempt).
 */
function sentinelWith(
    oldMaster: FakeClient,
    newMasters: Array<FakeClient | Error>,
    options: SentinelOptions = {}
) {
    const sentinel = new Sentinel(oldMaster as any, options);
    const s = sentinel as any;
    s.sentinelClient = fakeClient('sentinel', () => Promise.resolve([]));
    s.falkordb = new FalkorDB();
    s.falkordb.on('error', () => {});
    s.ready = true;
    const tryConnect = jest.fn(async () => {
        // Like the real lookup, the new master is only known after a round trip
        await new Promise((resolve) => setImmediate(resolve));
        const next = newMasters.shift();
        if (!next || next instanceof Error) {
            throw next ?? new Error('no master');
        }
        s.client = next;
    });
    s.tryConnectSentinelServer = tryConnect;
    return { sentinel, tryConnect };
}

describe('Sentinel master recovery', () => {
    beforeAll(() => {
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });
    afterAll(() => {
        (console.debug as jest.Mock).mockRestore();
    });

    it('resends an in-flight command to the new master when the connection is closed', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new SocketClosedUnexpectedlyError()));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, [newMaster]);

        await expect(sentinel.list()).resolves.toEqual(['g']);
        expect(oldMaster.destroy).toHaveBeenCalled();
        expect(tryConnect).toHaveBeenCalledTimes(1);
        expect(newMaster.falkordb.list).toHaveBeenCalledTimes(1);
    });

    it('retries commands flushed by destroying the old connection', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new DisconnectsClientError()));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel } = sentinelWith(oldMaster, [newMaster]);

        const results = await Promise.all([sentinel.list(), sentinel.list(), sentinel.list()]);
        expect(results).toEqual([['g'], ['g'], ['g']]);
    });

    it('re-discovers the master on READONLY replies', async () => {
        const oldMaster = fakeClient('old', () =>
            Promise.reject(new ErrorReply("READONLY You can't write against a read only replica.")));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, [newMaster]);

        await expect(sentinel.list()).resolves.toEqual(['g']);
        expect(tryConnect).toHaveBeenCalledTimes(1);
    });

    it('shares one re-discovery between concurrent failed commands', async () => {
        const oldMaster = fakeClient('old', () =>
            Promise.reject(new ErrorReply("READONLY You can't write against a read only replica.")));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, [newMaster]);

        await expect(Promise.all([sentinel.list(), sentinel.list()])).resolves.toEqual([['g'], ['g']]);
        expect(tryConnect).toHaveBeenCalledTimes(1);
    });

    it('retries on socket errors such as ECONNRESET', async () => {
        const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
        const oldMaster = fakeClient('old', () => Promise.reject(reset));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel } = sentinelWith(oldMaster, [newMaster]);

        await expect(sentinel.list()).resolves.toEqual(['g']);
    });

    it('keeps re-discovering the master until it succeeds', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new SocketClosedUnexpectedlyError()));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, [
            new Error('stale master'),
            new Error('stale master'),
            newMaster,
        ]);

        await expect(sentinel.list()).resolves.toEqual(['g']);
        expect(tryConnect).toHaveBeenCalledTimes(3);
    });

    it('keeps re-discovering when nothing listens for error events', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new SocketClosedUnexpectedlyError()));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, [new Error('stale master'), newMaster]);
        (sentinel as any).falkordb.removeAllListeners('error');

        await expect(sentinel.list()).resolves.toEqual(['g']);
        expect(tryConnect).toHaveBeenCalledTimes(2);
    });

    it('does not resend a write whose connection was lost, but still switches master', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new SocketClosedUnexpectedlyError()));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, [newMaster]);

        await expect(sentinel.query('g', 'CREATE ()')).rejects.toBeInstanceOf(SocketClosedUnexpectedlyError);
        expect(tryConnect).toHaveBeenCalledTimes(1);
        await expect(sentinel.query('g', 'CREATE ()')).resolves.toEqual(['g']);
        expect(newMaster.falkordb.query).toHaveBeenCalledTimes(1);
    });

    it('resends a write whose connection was lost when retryWritesOnConnectionLoss is set', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new SocketClosedUnexpectedlyError()));
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel } = sentinelWith(oldMaster, [newMaster], { retryWritesOnConnectionLoss: true });

        await expect(sentinel.query('g', 'CREATE ()')).resolves.toEqual(['g']);
    });

    it('resends writes that certainly did not run', async () => {
        for (const err of [
            new DisconnectsClientError(),
            new ErrorReply("READONLY You can't write against a read only replica."),
        ]) {
            const oldMaster = fakeClient('old', () => Promise.reject(err));
            const newMaster = fakeClient('new', () => Promise.resolve(['g']));
            const { sentinel } = sentinelWith(oldMaster, [newMaster]);

            await expect(sentinel.query('g', 'CREATE ()')).resolves.toEqual(['g']);
        }
    });

    it('lets in-flight commands finish on a demoted master that is still connected', async () => {
        const oldMaster: any = fakeClient('old', () =>
            Promise.reject(new ErrorReply("READONLY You can't write against a read only replica.")));
        oldMaster.isReady = true;
        oldMaster.close = jest.fn(() => Promise.resolve());
        const newMaster = fakeClient('new', () => Promise.resolve(['g']));
        const { sentinel } = sentinelWith(oldMaster, [newMaster]);

        await expect(sentinel.query('g', 'CREATE ()')).resolves.toEqual(['g']);
        expect(oldMaster.close).toHaveBeenCalled();
        expect(oldMaster.destroy).not.toHaveBeenCalled();
    });

    it('stops waiting for a demoted master after a timeout, without resending its in-flight writes', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask', 'nextTick'] });
        try {
            let failInFlight: (err: Error) => void = () => {};
            const inFlight = new Promise((_, reject) => { failInFlight = reject; });
            const readOnly = new ErrorReply("READONLY You can't write against a read only replica.");
            const oldMaster: any = fakeClient('old', () => Promise.reject(readOnly));
            oldMaster.falkordb.query
                .mockImplementationOnce(() => inFlight)
                .mockImplementationOnce(() => Promise.reject(readOnly));
            oldMaster.isReady = true;
            oldMaster.close = jest.fn(() => new Promise(() => {})); // never drains
            oldMaster.destroy = jest.fn(() => failInFlight(new DisconnectsClientError()));
            const newMaster = fakeClient('new', () => Promise.resolve(['g']));
            const { sentinel } = sentinelWith(oldMaster, [newMaster]);

            const stuck = sentinel.query('g', 'CREATE ()');
            stuck.catch(() => {});
            await expect(sentinel.query('g', 'CREATE ()')).resolves.toEqual(['g']);
            expect(oldMaster.destroy).not.toHaveBeenCalled();

            await jest.advanceTimersByTimeAsync(5000);
            expect(oldMaster.destroy).toHaveBeenCalled();
            await expect(stuck).rejects.toBeInstanceOf(DisconnectsClientError);
            expect(newMaster.falkordb.query).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it('does not retry other errors', async () => {
        const master = fakeClient('old', () => Promise.reject(new ErrorReply('ERR Invalid graph operation')));
        const { sentinel, tryConnect } = sentinelWith(master, []);

        await expect(sentinel.list()).rejects.toThrow('ERR Invalid graph operation');
        expect(tryConnect).not.toHaveBeenCalled();
        expect(master.falkordb.list).toHaveBeenCalledTimes(1);
    });

    it('gives up after a bounded number of retries', async () => {
        const masters = Array.from({ length: 10 }, (_, i) =>
            fakeClient(`m${i}`, () => Promise.reject(new SocketClosedUnexpectedlyError())));
        const { sentinel } = sentinelWith(masters[0], masters.slice(1));

        await expect(sentinel.list()).rejects.toBeInstanceOf(SocketClosedUnexpectedlyError);
    });

    it('stops re-discovering and fails waiting commands once disconnected', async () => {
        const oldMaster = fakeClient('old', () => Promise.reject(new SocketClosedUnexpectedlyError()));
        const { sentinel, tryConnect } = sentinelWith(oldMaster, Array(100).fill(new Error('down')));

        const pending = sentinel.list();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await sentinel.disconnect();

        await expect(pending).rejects.toThrow('The client is closed');
        const attempts = tryConnect.mock.calls.length;
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(tryConnect.mock.calls.length).toBe(attempts);
    });
});

/**
 * Minimal RESP server: answers GRAPH.LIST with its name, anything else with OK.
 */
async function fakeServer(name: string, { holdQueries = false } = {}) {
    const sockets = new Set<net.Socket>();
    let onQuery: () => void = () => {};
    const queryReceived = new Promise<void>((resolve) => { onQuery = resolve; });
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => {});
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk.toString();
            for (;;) {
                const command = parseCommand(buffer);
                if (!command) break;
                buffer = buffer.slice(command.length);
                const cmd = command.args[0]?.toUpperCase();
                if (cmd === 'GRAPH.QUERY') {
                    onQuery();
                    // Like a master paused with CLIENT PAUSE WRITE during a hand-over
                    if (!holdQueries) socket.write('*1\r\n*1\r\n$16\r\nNodes created: 1\r\n');
                } else {
                    socket.write(cmd === 'GRAPH.LIST'
                        ? `*1\r\n$${name.length}\r\n${name}\r\n`
                        : '+OK\r\n');
                }
            }
        });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return {
        port: (server.address() as net.AddressInfo).port,
        queryReceived,
        dropConnections: () => sockets.forEach((s) => s.destroy()),
        close: () => {
            sockets.forEach((s) => s.destroy());
            return new Promise((resolve) => server.close(resolve));
        },
    };
}

function parseCommand(buffer: string): { args: string[]; length: number } | null {
    let pos = 0;
    const line = () => {
        const end = buffer.indexOf('\r\n', pos);
        if (end < 0) return null;
        const value = buffer.slice(pos, end);
        pos = end + 2;
        return value;
    };
    const header = line();
    if (header === null) return null;
    const args: string[] = [];
    for (let i = 0; i < parseInt(header.slice(1), 10); i++) {
        const size = line();
        if (size === null) return null;
        const len = parseInt(size.slice(1), 10);
        if (buffer.length < pos + len + 2) return null;
        args.push(buffer.slice(pos, pos + len));
        pos += len + 2;
    }
    return { args, length: pos };
}

describe('Sentinel master connection', () => {
    beforeAll(() => {
        jest.spyOn(console, 'debug').mockImplementation(() => {});
    });
    afterAll(() => {
        (console.debug as jest.Mock).mockRestore();
    });

    function sentinelPointingTo(ports: number[], options: SentinelOptions = {}) {
        const sentinelClient: any = {
            options: { modules: { falkordb: commands }, RESP: 2 },
            disconnect: jest.fn(() => Promise.resolve()),
            falkordb: {
                sentinelMasters: jest.fn(async () => {
                    const port = ports.length > 1 ? ports.shift()! : ports[0];
                    return [['name', 'master', 'ip', '127.0.0.1', 'port', String(port)]];
                }),
            },
        };
        const falkordb = new FalkorDB();
        falkordb.on('error', () => {});
        return { sentinel: new Sentinel(sentinelClient, options), falkordb };
    }

    it('reconnects to the new master when the server closes the connection', async () => {
        const oldMaster = await fakeServer('old');
        const newMaster = await fakeServer('new');
        const { sentinel, falkordb } = sentinelPointingTo([oldMaster.port, newMaster.port]);
        try {
            await sentinel.init(falkordb);
            await expect(sentinel.list()).resolves.toEqual(['old']);

            oldMaster.dropConnections();
            await expect(sentinel.list()).resolves.toEqual(['new']);
        } finally {
            await sentinel.disconnect();
            await oldMaster.close();
            await newMaster.close();
        }
    });

    for (const retryWritesOnConnectionLoss of [false, true]) {
        it(`handles a write held by the old master during hand-over (retryWritesOnConnectionLoss: ${retryWritesOnConnectionLoss})`, async () => {
            const oldMaster = await fakeServer('old', { holdQueries: true });
            const newMaster = await fakeServer('new');
            const { sentinel, falkordb } = sentinelPointingTo(
                [oldMaster.port, newMaster.port], { retryWritesOnConnectionLoss });
            try {
                await sentinel.init(falkordb);
                const write = sentinel.query('g', 'CREATE ()');
                await oldMaster.queryReceived;
                oldMaster.dropConnections();

                if (retryWritesOnConnectionLoss) {
                    await expect(write).resolves.toBeDefined();
                } else {
                    // The outcome is unknown, so it is not resent
                    await expect(write).rejects.toBeInstanceOf(SocketClosedUnexpectedlyError);
                }
                await expect(sentinel.list()).resolves.toEqual(['new']);
            } finally {
                await sentinel.disconnect();
                await oldMaster.close();
                await newMaster.close();
            }
        });
    }

    it('fails init without retrying when the master is unreachable', async () => {
        const server = await fakeServer('gone');
        await server.close();
        const { sentinel, falkordb } = sentinelPointingTo([server.port]);

        await expect(sentinel.init(falkordb)).rejects.toThrow();
        expect((sentinel as any).recovery).toBeNull();
        await sentinel.disconnect();
    });
});
