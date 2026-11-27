import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import { client } from './dbConnection';
import {
    CommandSender,
    answersSchemaHash,
    hashesSchemaVersion,
    serverAnswersSchemaHash,
    serverModuleVersion,
} from './serverVersion';

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

    it.each([
        [42205, true, false],
        [60004, false, false],
        [60201, false, true],
        // edge
        [999999, false, true],
    ])('reads graph module %i as hashing the schema version: %s, answering SCHEMA_HASH: %s', (version, hashes, answers) => {
        expect(hashesSchemaVersion(version)).toBe(hashes);
        expect(answersSchemaHash(version)).toBe(answers);
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

        // The version-dependent tests read what the server does from its
        // version, so check that the server does it
        it('reads from the version what the server does', async () => {
            const connection = await db.connection;
            const version = await serverModuleVersion(connection);
            expect(version).toBeGreaterThanOrEqual(40000);

            expect(await serverAnswersSchemaHash(connection)).toBe(answersSchemaHash(version));

            // As tests/globalSetup.ts found from how the server rejects a
            // stale version
            const scheme = process.env.FALKORDB_SCHEMA_VERSION;
            expect(scheme).toBeDefined();
            expect(scheme === 'hash').toBe(hashesSchemaVersion(version));
        });
    });
});
