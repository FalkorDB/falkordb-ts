import { jest, describe, it, expect, afterEach } from '@jest/globals';
import * as net from 'net';
import * as redisClient from '@redis/client';
import FalkorDB from '../src/falkordb';
import { Cluster } from '../src/clients/cluster';
import type { SingleGraphConnection } from '../src/clients/single';

type FakeNode = { id: string; falkordb: Record<string, jest.Mock> };

function fakeNode(id: string): FakeNode {
  return {
    id,
    falkordb: {
      configSet: jest.fn(async () => 'OK'),
      udfLoad: jest.fn(async () => 'OK'),
      udfFlush: jest.fn(async () => 'OK'),
      udfDelete: jest.fn(async () => 'OK'),
    },
  };
}

/**
 * Replaces `createCluster` with a fake whose keyless commands land on a
 * replica, the way node-redis routes them when `useReplicas` is on.
 */
function mockCluster() {
  const master = fakeNode('master');
  const replica = fakeNode('replica');
  const cluster = {
    masters: [master],
    replicas: [replica],
    falkordb: replica.falkordb,
    getRandomNode: () => replica,
    nodeClient: (node: FakeNode) => Promise.resolve(node),
    sendCommand: jest.fn(async () => [[[1, 'label']], [[[2, 'NewLabel']]], []]),
    on() { return this; },
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
  };
  (replica.falkordb as Record<string, jest.Mock>).roQuery = jest.fn();
  const createCluster = jest
    .spyOn(redisClient, 'createCluster')
    .mockReturnValue(cluster as unknown as ReturnType<typeof redisClient.createCluster>);
  return { createCluster, master, replica, cluster };
}

function fakeConnection(): SingleGraphConnection {
  return { options: {}, disconnect: jest.fn() } as unknown as SingleGraphConnection;
}

function useReplicasOption(createCluster: ReturnType<typeof mockCluster>['createCluster']) {
  return (createCluster.mock.calls[0][0] as { useReplicas?: boolean }).useReplicas;
}

const servers: net.Server[] = [];
const accepted: net.Socket[] = [];

function bulkString(value: string) {
  return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

/**
 * A cluster node that answers `INFO server` and `INFO replication` with the
 * given role, and `+OK` to everything else.
 */
async function fakeClusterNode(role: 'master' | 'slave', options: { readonly?: boolean } = {}) {
  const server = net.createServer(socket => {
    accepted.push(socket);
    let buffer = '';
    socket.on('data', data => {
      buffer += data.toString();
      for (;;) {
        const header = /^\*(\d+)\r\n/.exec(buffer);
        if (!header) return;
        let offset = header[0].length;
        const args: string[] = [];
        for (let i = 0; i < Number(header[1]); i++) {
          const length = /^\$(\d+)\r\n/.exec(buffer.slice(offset));
          if (!length || buffer.length < offset + length[0].length + Number(length[1]) + 2) return;
          offset += length[0].length;
          args.push(buffer.slice(offset, offset + Number(length[1])));
          offset += Number(length[1]) + 2;
        }
        buffer = buffer.slice(offset);
        const command = args.join(' ').toUpperCase();
        if (command === 'INFO SERVER') {
          socket.write(bulkString('# Server\r\nredis_mode:cluster\r\n'));
        } else if (command === 'INFO REPLICATION') {
          socket.write(bulkString(`# Replication\r\nrole:${role}\r\n`));
        } else {
          socket.write('+OK\r\n');
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return FalkorDB.connect({ socket: { host: '127.0.0.1', port }, ...options });
}

afterEach(async () => {
  jest.restoreAllMocks();
  accepted.splice(0).forEach(socket => socket.destroy());
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

describe('Cluster replicas', () => {
  it('does not use replicas by default', () => {
    const { createCluster } = mockCluster();
    new Cluster(fakeConnection());
    expect(useReplicasOption(createCluster)).toBe(false);
  });

  it('passes useReplicas to the cluster client', () => {
    const { createCluster } = mockCluster();
    new Cluster(fakeConnection(), { useReplicas: true });
    expect(useReplicasOption(createCluster)).toBe(true);
  });

  it('sends keyless writes to a master', async () => {
    const { master, replica } = mockCluster();
    const cluster = new Cluster(fakeConnection(), { useReplicas: true });

    await cluster.configSet('RESULTSET_SIZE', 100);
    await cluster.udfLoad('lib', 'function f() {}');
    await cluster.udfFlush();
    await cluster.udfDelete('lib');

    for (const command of ['configSet', 'udfLoad', 'udfFlush', 'udfDelete']) {
      expect(master.falkordb[command]).toHaveBeenCalledTimes(1);
      expect(replica.falkordb[command]).not.toHaveBeenCalled();
    }
  });

  it('runs a primary roQuery on the master as GRAPH.RO_QUERY', async () => {
    const { cluster: redisCluster, replica } = mockCluster();
    const cluster = new Cluster(fakeConnection(), { useReplicas: true });

    const reply = await cluster.roQuery('graph', 'CALL db.labels()', undefined, false, undefined, true);

    // Routed by the graph key with isReadonly false, i.e. to the slot's master
    expect(redisCluster.sendCommand).toHaveBeenCalledWith(
      'graph', false, ['GRAPH.RO_QUERY', 'graph', 'CALL db.labels()']);
    expect(replica.falkordb.roQuery).not.toHaveBeenCalled();
    expect(reply.data).toEqual([[[2, 'NewLabel']]]);
  });

  it('returns a master as the connection', async () => {
    const { master } = mockCluster();
    const cluster = new Cluster(fakeConnection(), { useReplicas: true });
    await expect(cluster.getConnection()).resolves.toBe(master);
  });

  describe('FalkorDB.connect', () => {
    it('uses replicas when connecting through a replica', async () => {
      const { createCluster } = mockCluster();
      const db = await fakeClusterNode('slave');
      expect(useReplicasOption(createCluster)).toBe(true);
      await db.close();
    });

    it('uses only masters when connecting through a master', async () => {
      const { createCluster } = mockCluster();
      const db = await fakeClusterNode('master');
      expect(useReplicasOption(createCluster)).toBe(false);
      await db.close();
    });

    it('uses replicas when readonly is requested', async () => {
      const { createCluster } = mockCluster();
      const db = await fakeClusterNode('master', { readonly: true });
      expect(useReplicasOption(createCluster)).toBe(true);
      await db.close();
    });
  });
});
