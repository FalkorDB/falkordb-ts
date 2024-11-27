import { client } from './dbConnection';
import { expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import Graph from '../src/graph';

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

        expect(plan[0]).toMatch(/Results/); 
        expect(plan[1]).toMatch(/Project/);
        expect(plan[2]).toMatch(/Unwind/); 
        expect(plan[0]).toContain('Records produced: 4');
    });

    test('Verifies query execution plan structure with Cartesian operation', async () => {
        const plan = await graphName.profile("MATCH (a), (b) RETURN *");
        type PlanStep = string | { name: string; alias: string };

        const expectedPlanSteps: PlanStep[] = [
            'Results',
            'Project',
            'Cartesian Product',
            { name: 'All Node Scan', alias: '(a)' },
            { name: 'All Node Scan', alias: '(b)' }
        ];
        
        expectedPlanSteps.forEach((step, index) => {
            if (typeof step === 'string') {
                expect(plan[index]).toContain(step);
            } else {
                expect(plan[index]).toContain(step.name);
                expect(plan[index]).toContain(step.alias);
            }
        })
    });
});
