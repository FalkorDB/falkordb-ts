import { describe, test, beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
import { client } from './dbConnection';
import FalkorDB from '../src/falkordb';
import Graph from '../src/graph';
import { expectProfile } from './planHelpers';

describe('Profile Tests', () => {

    let clientInstance: FalkorDB;
    let graphName: Graph;

    beforeAll(async () => {
        try {
            clientInstance = await client();
        } catch (error) {
            console.error('Failed to initialize database connection:', error);
            throw error;
        } 
    });

    afterAll(async () => {
        try {
            await clientInstance.close()
        } catch (error){
            console.error('Failed to close database connection:', error);
            throw error;
        }
    });

    beforeEach(async () => {
        graphName = clientInstance.selectGraph("graph");
    })

    afterEach(async () => {
        await graphName.delete()
    })

    test('Verifies query execution plan structure with UNWIND operation', async () => {
        const plan = await graphName.profile("UNWIND range(0, 3) AS x RETURN x");

        // which operations the query compiles into is up to the engine, the
        // client is responsible for handing back the profile it was given
        expectProfile(plan, 2, 4);
    });

    test('Verifies query execution plan structure with Cartesian operation', async () => {
        const plan = await graphName.profile("MATCH (a), (b) RETURN *");

        expectProfile(plan, 4, 0);
    });
});
