import { describe, it, expect } from '@jest/globals';
import { client } from './dbConnection';
import FalkorDB from '../src/falkordb';

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
    const UNREACHABLE_HOST = 'falkordb-host-that-does-not-exist.invalid';

    /**
     * The resolved socket options of the underlying client, so the assertions verify where the
     * client was actually pointed instead of relying on the default host and port being unused.
     */
    const resolvedSocket = async (db: FalkorDB) => {
        const connection = await db.connection;
        return (connection.options ?? {}).socket;
    };

    it('connects with top-level host and port', async () => {
        const db = await FalkorDB.connect({ host: HOST, port: PORT });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('connects with socket host and port', async () => {
        const db = await FalkorDB.connect({ socket: { host: HOST, port: PORT } });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('connects with a falkor url', async () => {
        const db = await FalkorDB.connect({ url: `falkor://${HOST}:${PORT}` });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('lets socket values take precedence over top-level ones', async () => {
        const db = await FalkorDB.connect({
            host: UNREACHABLE_HOST,
            port: 1,
            socket: { host: HOST, port: PORT }
        });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('merges top-level and socket values instead of replacing them', async () => {
        const db = await FalkorDB.connect({ host: HOST, socket: { port: PORT } });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('keeps other socket options when merging top-level host and port', async () => {
        const db = await FalkorDB.connect({
            host: HOST,
            port: PORT,
            socket: { connectTimeout: 5000 }
        });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT, connectTimeout: 5000 });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('lets the url take precedence over top-level host and port', async () => {
        const db = await FalkorDB.connect({
            url: `falkor://${HOST}:${PORT}`,
            host: UNREACHABLE_HOST,
            port: 1
        });
        expect(await resolvedSocket(db)).toMatchObject({ host: HOST, port: PORT });
        expect(await db.list()).toBeDefined();
        await db.close();
    });

    it('rejects an unreachable top-level host instead of silently using the default', async () => {
        await expect(FalkorDB.connect({ host: UNREACHABLE_HOST, port: PORT })).rejects.toThrow();
    });

    it('does not mutate the given options object', async () => {
        const options = { host: HOST, port: PORT };
        const snapshot = JSON.stringify(options);
        const db = await FalkorDB.connect(options);
        await db.close();
        expect(JSON.stringify(options)).toBe(snapshot);
    });
});
