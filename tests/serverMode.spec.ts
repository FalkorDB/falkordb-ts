import { jest, describe, it, expect, afterEach } from '@jest/globals';
import * as net from 'net';
import * as redisClient from '@redis/client';
import FalkorDB from '../src/falkordb';
import { serverMode } from '../src/server-mode';

// Redis reports the mode as `redis_mode`, Valkey as `server_mode` (unless
// `extended-redis-compatibility` is on). FalkorDB images ship either server.
const MODE_FIELDS = ['redis_mode', 'server_mode'] as const;

/** An `INFO server` reply shaped like the real ones, with `field:mode` in it. */
function infoServer(field: string, mode: string, eol = '\r\n') {
    return [
        '# Server',
        'redis_version:7.2.4',
        'server_name:valkey',
        `${field}:${mode}`,
        'os:Linux 6.10.14-linuxkit aarch64',
        '',
    ].join(eol);
}

describe('serverMode', () => {
    describe.each(MODE_FIELDS)('with %s', field => {
        it.each(['standalone', 'sentinel', 'cluster'] as const)('reads %s', mode => {
            expect(serverMode(infoServer(field, mode))).toBe(mode);
        });

        it('reads a reply with bare \\n line endings', () => {
            expect(serverMode(infoServer(field, 'cluster', '\n'))).toBe('cluster');
        });
    });

    it('treats a reply without a mode as standalone', () => {
        expect(serverMode('# Server\r\nredis_version:7.2.4\r\n')).toBe('standalone');
    });

    it('treats an unknown mode as standalone', () => {
        expect(serverMode(infoServer('server_mode', 'something-new'))).toBe('standalone');
    });

    it('only reads the mode field itself', () => {
        // `includes("redis_mode:cluster")` matched this
        const info = '# Server\r\nconfig_file:/etc/redis_mode:cluster.conf\r\nserver_mode:standalone\r\n';
        expect(serverMode(info)).toBe('standalone');
    });
});

const servers: net.Server[] = [];
const accepted: net.Socket[] = [];

function bulkString(value: string) {
    return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
}

/**
 * Starts a server that answers each RESP command with `reply(command)`, and
 * records the commands it received.
 */
async function fakeServer(reply: (command: string) => string | undefined) {
    const commands: string[] = [];
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
                commands.push(command);
                socket.write(reply(command) ?? '+OK\r\n');
            }
        });
    });
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as net.AddressInfo).port, commands };
}

/** A node that reports `field:mode` and answers `+OK` to everything else. */
function fakeNode(field: string, mode: string, reply: (command: string) => string | undefined = () => undefined) {
    return fakeServer(command => {
        if (command === 'INFO SERVER') return bulkString(infoServer(field, mode));
        if (command === 'INFO REPLICATION') return bulkString('# Replication\r\nrole:master\r\n');
        return reply(command);
    });
}

/** Replaces `createCluster` with a fake, so no cluster topology is needed. */
function mockCreateCluster() {
    const cluster = {
        on() { return this; },
        connect: jest.fn(async () => undefined),
        disconnect: jest.fn(async () => undefined),
    };
    return jest
        .spyOn(redisClient, 'createCluster')
        .mockReturnValue(cluster as unknown as ReturnType<typeof redisClient.createCluster>);
}

afterEach(async () => {
    jest.restoreAllMocks();
    accepted.splice(0).forEach(socket => socket.destroy());
    await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

describe.each(MODE_FIELDS)('FalkorDB.connect to a server reporting %s', field => {
    it('uses the cluster client for a cluster node', async () => {
        const createCluster = mockCreateCluster();
        const { port } = await fakeNode(field, 'cluster');

        const db = await FalkorDB.connect({ socket: { host: '127.0.0.1', port } });
        try {
            expect(createCluster).toHaveBeenCalledTimes(1);
        } finally {
            await db.close();
        }
    });

    it('asks a sentinel for the master and connects to it', async () => {
        const master = await fakeNode(field, 'standalone',
            command => command === 'GRAPH.LIST' ? '*0\r\n' : undefined);
        const masterEntry = ['name', 'master', 'ip', '127.0.0.1', 'port', String(master.port)];
        const sentinel = await fakeNode(field, 'sentinel', command =>
            command === 'SENTINEL MASTERS'
                ? `*1\r\n*${masterEntry.length}\r\n${masterEntry.map(bulkString).join('')}`
                : undefined);

        const db = await FalkorDB.connect({ socket: { host: '127.0.0.1', port: sentinel.port } });
        try {
            expect(sentinel.commands).toContain('SENTINEL MASTERS');
            // The master got a connection of its own, and queries go there
            expect(master.commands).not.toHaveLength(0);
            const masterCommands = master.commands.length;
            await db.list();
            expect(master.commands.slice(masterCommands)).toEqual(['GRAPH.LIST']);
            expect(sentinel.commands).not.toContain('GRAPH.LIST');
        } finally {
            await db.close();
        }
    });

    it('uses a single connection for a standalone server', async () => {
        const createCluster = mockCreateCluster();
        const server = await fakeNode(field, 'standalone');

        const db = await FalkorDB.connect({ socket: { host: '127.0.0.1', port: server.port } });
        try {
            expect(createCluster).not.toHaveBeenCalled();
            expect(server.commands).not.toContain('SENTINEL MASTERS');
        } finally {
            await db.close();
        }
    });
});
