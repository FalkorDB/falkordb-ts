import { jest, describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import {
    DisconnectsClientError,
    ErrorReply,
    SocketClosedUnexpectedlyError,
} from '@redis/client';
import FalkorDB from '../src/falkordb';
import { Sentinel } from '../src/clients/sentinel';

type FakeClient = {
    name: string;
    destroy: jest.Mock;
    disconnect: jest.Mock;
    falkordb: { list: jest.Mock };
};

function fakeClient(name: string, list: () => Promise<unknown>): FakeClient {
    return {
        name,
        destroy: jest.fn(),
        disconnect: jest.fn(() => Promise.resolve()),
        falkordb: { list: jest.fn(list) },
    };
}

/**
 * Builds a Sentinel whose master connection is `oldMaster`, with master
 * re-discovery stubbed to switch to `newMasters` in order (an Error fails
 * that attempt).
 */
function sentinelWith(oldMaster: FakeClient, newMasters: Array<FakeClient | Error>) {
    const sentinel = new Sentinel(oldMaster as any);
    const s = sentinel as any;
    s.sentinelClient = fakeClient('sentinel', () => Promise.resolve([]));
    s.falkordb = new FalkorDB();
    s.falkordb.on('error', () => {});
    s.ready = true;
    const tryConnect = jest.fn(async () => {
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
