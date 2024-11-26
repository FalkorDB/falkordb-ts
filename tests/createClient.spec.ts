import { client } from './dbConnection';
import { expect } from '@jest/globals';

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