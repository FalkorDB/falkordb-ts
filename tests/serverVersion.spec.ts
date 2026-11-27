import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import { client } from './dbConnection';
import { CommandSender, serverAnswersSchemaHash, serverModuleVersion } from './serverVersion';

const fake = (reply: (args: Array<string>) => unknown) => {
    const sent: Array<Array<string>> = [];
    const sender: CommandSender = {
        sendCommand: async (args) => {
            sent.push(args);
            return reply(args);
        },
    };
    return { sender, sent };
};

describe('serverVersion', () => {
    describe('serverModuleVersion', () => {
        it('reads the graph module by name, after any other module', async () => {
            // As 4.x lists them
            const { sender } = fake(() => [
                ['name', 'vectorset', 'ver', 1, 'path', '', 'args', []],
                ['name', 'graph', 'ver', 42205, 'path', '/var/lib/falkordb/bin/falkordb.so', 'args', []],
            ]);
            expect(await serverModuleVersion(sender)).toBe(42205);
        });

        it('throws when no graph module is loaded', async () => {
            const { sender } = fake(() => [['name', 'vectorset', 'ver', 1]]);
            await expect(serverModuleVersion(sender)).rejects.toThrow(/no graph module/);
        });

        it('throws on a version that is not an integer', async () => {
            const { sender } = fake(() => [['name', 'graph', 'ver', 'x']]);
            await expect(serverModuleVersion(sender)).rejects.toThrow(/graph version x/);
        });
    });

    describe('serverAnswersSchemaHash', () => {
        it.each([
            ['answers', [[], [], ['Cached execution: 0'], ['hash', '0']], true],
            ['ignores the argument', [[], [], ['Cached execution: 0']], false],
        ])('tells a server that %s it', async (_case, reply, expected) => {
            const { sender, sent } = fake((args) => (args[0] === 'GRAPH.QUERY' ? reply : 'OK'));
            expect(await serverAnswersSchemaHash(sender)).toBe(expected);
            // The probe graph is deleted
            expect(sent[1]).toEqual(['GRAPH.DELETE', sent[0][1]]);
        });
    });

    describe('against the server under test', () => {
        let db: FalkorDB;

        beforeAll(async () => {
            db = await client();
        });

        afterAll(async () => {
            await db?.close();
        });

        it('agrees with what the server does', async () => {
            const connection = await db.connection;
            const version = await serverModuleVersion(connection);
            expect(version).toBeGreaterThanOrEqual(40000);

            // 4.x versions a schema with a hash of its names, 6.x with a counter
            const scheme = process.env.FALKORDB_SCHEMA_VERSION;
            if (scheme === 'hash') expect(version).toBeLessThan(60000);
            if (scheme === 'counter') expect(version).toBeGreaterThanOrEqual(60000);

            // SCHEMA_HASH came in 6.2.0
            if (await serverAnswersSchemaHash(connection)) {
                expect(version).toBeGreaterThanOrEqual(60200);
            } else {
                expect(version).toBeLessThan(60200);
            }
        });
    });
});
