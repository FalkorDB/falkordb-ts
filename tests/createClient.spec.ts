import { client } from './dbConnection';
import { expect } from '@jest/globals';

/**
 * Creates and validates a FalkorDB client instance
 * @returns {Promise<Object>} A promise that resolves to a FalkorDB client instance
 * @throws {Error} If the client creation fails
 */
describe('FalkorDB Client', () => {
    it('create a FalkorDB client instance validated existing', async () => {
        const db = await client();
        expect(db).not.toBeNull();
        await db.close();
    });
});