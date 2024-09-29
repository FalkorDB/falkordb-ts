import { client } from './dbConnection';
import { expect } from '@jest/globals';

describe('FalkorDB Client', () => {
    it('create a FalkorDB client instance validated existing', async () => {
        const db = await client();
        expect(db).not.toBeNull();
        await db.close();
    });
});