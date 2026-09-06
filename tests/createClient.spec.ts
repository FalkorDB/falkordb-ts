import { describe, it, expect } from '@jest/globals';
import { client } from './dbConnection';
import FalkorDB, { FalkorDBOptions } from '../src/falkordb';

describe('FalkorDB Client', () => {
    it('create a FalkorDB client instance validated existing', async () => {
        const db = await client();
        expect(db).not.toBeNull();
        await db.close();
    });

    it('Validate getConfig and setConfig methods', async () => {
        const db = await client();
        const NEW_SIZE = 3;
        const configName = "RESULTSET_SIZE";
        const [_, originalValue] = await db.configGet(configName);
        const originalValueNumber = Number(originalValue);
        try {
            await db.configSet(configName, NEW_SIZE);
            const [_, newValue] = await db.configGet(configName);
            expect(Number(newValue)).toBe(NEW_SIZE);
        } finally {
            await db.configSet(configName, originalValueNumber);
            const [_, restoredValue] = await db.configGet(configName);
            expect(Number(restoredValue)).toBe(originalValueNumber);
            await db.close();
        }
    });
    
    it('Validate handling of invalid configuration settings', async () => {
        const db = await client();
        await expect(db.configGet("none_existing_conf")).rejects.toThrow(/Unknown configuration field/);
        await expect(db.configSet("none_existing_conf", 1)).rejects.toThrow(/Unknown configuration field/);
        await expect(db.configSet("RESULTSET_SIZE", "invalid value")).rejects.toThrow(/Failed to set config value RESULTSET_SIZE to invalid value/);
        await db.close();
    });

    type ConfigRole = {
        role: string;
        input: number | string;
    }
    const roleModificationData: ConfigRole[] = [
        {role: "MAX_QUEUED_QUERIES", input: 20},
        {role: "TIMEOUT_MAX", input: 10},
        {role: "TIMEOUT_DEFAULT", input: 10},
        {role: "RESULTSET_SIZE", input: 20},
        {role: "QUERY_MEM_CAPACITY", input: 20},
        {role: "VKEY_MAX_ENTITY_COUNT", input: 20},
        {role: "CMD_INFO", input: "no"},
        {role: "MAX_INFO_QUERIES", input: 20}
    ]

    roleModificationData.forEach(({ role, input }) => {
        it(`Validate configuration modification for: ${role} role`, async () => {
            const db = await client();
            const prevValue = await db.configGet(role);
            const prevValueFormatted = Number(prevValue[1]); 
            await db.configSet(role, input);
            const value = (role === "CMD_INFO") ? (prevValueFormatted === 1 ? "yes" : "no") : prevValueFormatted
            await db.configSet(role, value);
            await db.close();
        });
    });    
    
});
describe('FalkorDB connection options', () => {
    const HOST = process.env.FALKORDB_HOST || 'localhost';
    const PORT = parseInt(process.env.FALKORDB_PORT || '6379', 10);
    // Nothing can be listening here, so connecting fails immediately and for the expected reason.
    const CLOSED_PORT = 1;

    /**
     * The resolved socket options of the underlying client, so the assertions verify where the
     * client was actually pointed instead of relying on the default host and port being unused.
     */
    const resolvedSocket = async (db: FalkorDB) => {
        const connection = await db.connection;
        return (connection.options ?? {}).socket;
    };

    /**
     * Always closes the client, so a failed assertion cannot leave the socket open and hang jest.
     */
    const withConnection = async (options: FalkorDBOptions, assertions: (db: FalkorDB) => Promise<void>) => {
        const db = await FalkorDB.connect(options);
        try {
            await assertions(db);
        } finally {
            await db.close();
        }
    };

    const expectsToConnectTo = async (options: FalkorDBOptions) => {
        await withConnection(options, async (db) => {
            expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
            expect(await db.list()).toBeDefined();
        });
    };

    it('connects with top-level host and port', async () => {
        await expectsToConnectTo({ host: HOST, port: PORT });
    });

    it('connects with socket host and port', async () => {
        await expectsToConnectTo({ socket: { host: HOST, port: PORT } });
    });

    it('connects with a falkor url', async () => {
        await expectsToConnectTo({ url: `falkor://${HOST}:${PORT}` });
    });

    it('lets socket values take precedence over top-level ones', async () => {
        await expectsToConnectTo({
            host: 'not-the-host-to-use',
            port: CLOSED_PORT,
            socket: { host: HOST, port: PORT }
        });
    });

    it('merges top-level and socket values instead of replacing them', async () => {
        await expectsToConnectTo({ host: HOST, socket: { port: PORT } });
    });

    it('keeps other socket options when merging top-level host and port', async () => {
        await withConnection({ host: HOST, port: PORT, socket: { connectTimeout: 5000 } }, async (db) => {
            expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT, connectTimeout: 5000 });
            expect(await db.list()).toBeDefined();
        });
    });

    it('lets the url take precedence over top-level host and port', async () => {
        await expectsToConnectTo({
            url: `falkor://${HOST}:${PORT}`,
            host: 'not-the-host-to-use',
            port: CLOSED_PORT
        });
    });

    it('keeps other socket options when a url is given', async () => {
        await withConnection({ url: `falkor://${HOST}:${PORT}`, socket: { connectTimeout: 5000 } }, async (db) => {
            expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT, connectTimeout: 5000 });
        });
    });

    it('fails on an unreachable top-level host and port instead of silently using the default', async () => {
        await expect(FalkorDB.connect({ host: '127.0.0.1', port: CLOSED_PORT })).rejects.toThrow();
    });

    it('does not mutate the given options object', async () => {
        const options = { host: HOST, port: PORT };
        const snapshot = JSON.stringify(options);
        const db = await FalkorDB.connect(options);
        await db.close();
        expect(JSON.stringify(options)).toBe(snapshot);
    });
});
