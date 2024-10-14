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
        const configName = "RESULTSET_SIZE";
        const prevValue = await db.configGet(configName);
        const prevValueNumber = Number(prevValue[1]);
        await db.configSet(configName, 3);
        const newValue = await db.configGet(configName);
        expect(Number(newValue[1])).toBe(3);
        await db.configSet(configName, prevValueNumber);
        const restoreResponse = await db.configGet(configName);
        expect(Number(restoreResponse[1])).toBe(10000)
        await db.close();
    });
    
    it('Validate handling of invalid configuration settings', async () => {
        const db = await client();
        await expect(db.configGet("none_existing_conf")).rejects.toThrow();
        await expect(db.configSet("none_existing_conf", 1)).rejects.toThrow();
        await expect(db.configSet("RESULTSET_SIZE", "invalid value")).rejects.toThrow();
        await db.close();
    });

    const roleModificationData = [
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