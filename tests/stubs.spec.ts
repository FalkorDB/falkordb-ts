import { jest, describe, it, expect, afterEach } from '@jest/globals';
import * as redisClient from '@redis/client';
import type { CommandParser } from '@redis/client';
import FalkorDB from '../src/falkordb';
import { Single, SingleGraphConnection } from '../src/clients/single';
import { Cluster } from '../src/clients/cluster';
import * as STUBS from '../src/commands/STUBS';

type StubsFn = () => Promise<Array<string>>;

function fakeConnection(stubs: StubsFn): SingleGraphConnection {
  return {
    options: {},
    disconnect: jest.fn(),
    falkordb: { stubs },
  } as unknown as SingleGraphConnection;
}

function fakeCluster(masters: Array<StubsFn>): Cluster {
  const cluster = {
    masters: masters.map((stubs, index) => ({ id: `master-${index}`, stubs })),
    nodeClient: (master: { stubs: StubsFn }) =>
      Promise.resolve({ falkordb: { stubs: master.stubs } }),
  };

  jest
    .spyOn(redisClient, 'createCluster')
    .mockReturnValue(cluster as unknown as ReturnType<typeof redisClient.createCluster>);

  return new Cluster(fakeConnection(async () => []));
}

describe('STUBS command', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should push GRAPH.STUBS onto the command parser', () => {
    const parser = { push: jest.fn() };

    STUBS.parseCommand(parser as unknown as CommandParser);

    expect(parser.push).toHaveBeenCalledWith('GRAPH.STUBS');
  });

  describe('Single', () => {
    it('should delegate to the underlying connection', async () => {
      const single = new Single(fakeConnection(async () => ['offloaded']));

      await expect(single.stubs()).resolves.toEqual(['offloaded']);
    });
  });

  describe('FalkorDB', () => {
    it('should reject when no client is connected', async () => {
      await expect(new FalkorDB().stubs()).rejects.toThrow('Method not implemented.');
    });
  });

  describe('Cluster', () => {
    it('should aggregate the replies of all masters', async () => {
      const cluster = fakeCluster([
        async () => ['graph-a'],
        async () => ['graph-b', 'graph-c'],
      ]);

      await expect(cluster.stubs()).resolves.toEqual(['graph-a', 'graph-b', 'graph-c']);
    });

    it('should return partial results when some masters fail', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const failure = new Error('node down');
      const cluster = fakeCluster([
        async () => ['graph-a'],
        async () => {
          throw failure;
        },
      ]);

      await expect(cluster.stubs()).resolves.toEqual(['graph-a']);
      expect(consoleError).toHaveBeenCalledWith('Some nodes failed to respond:', [failure]);
    });

    it('should reject when every master fails', async () => {
      const cluster = fakeCluster([
        async () => {
          throw new Error('unknown command `GRAPH.STUBS`');
        },
        async () => {
          throw new Error('unknown command `GRAPH.STUBS`');
        },
      ]);

      await expect(cluster.stubs()).rejects.toThrow('unknown command `GRAPH.STUBS`');
    });

    it('should resolve to an empty list when there are no masters', async () => {
      const cluster = fakeCluster([]);

      await expect(cluster.stubs()).resolves.toEqual([]);
    });
  });
});
