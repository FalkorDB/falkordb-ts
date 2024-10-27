import { client } from './dbConnection';
import { expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import Graph, { ConstraintType, EntityType } from '../src/graph';

describe('Constraint Tests', () => {
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
        graphName = clientInstance.selectGraph("constraints");
    })

    afterEach(async () => {
        await graphName.delete()
    })

    it('Validate creation and deletion of unique and mandatory constraints on nodes', async () => {
        await graphName.query(`CREATE (:Person {name: 'Alice'})`);
        await graphName.query("CREATE INDEX ON :Person(name)");
        await graphName.constraintCreate("UNIQUE" as ConstraintType, "NODE" as EntityType, "Person", "name");
        await graphName.constraintCreate("MANDATORY" as ConstraintType, "NODE" as EntityType, "Person", "name");
        await graphName.query("CREATE INDEX ON :Person(v1, v2)");
        await graphName.constraintCreate("UNIQUE" as ConstraintType, "NODE" as EntityType, "Person", "v1", "v2");
        const nodeConstraints = await graphName.query("CALL db.constraints()");
        expect(nodeConstraints.data?.length).toBe(3);
        expect(nodeConstraints.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'UNIQUE',
                    label: 'Person',
                    properties: ['v1', 'v2'],
                    entitytype: 'NODE',
                    status: 'OPERATIONAL'
                }),
                expect.objectContaining({
                    type: 'MANDATORY',
                    label: 'Person',
                    properties: ['name'],
                    entitytype: 'NODE',
                    status: 'OPERATIONAL'
                }),
                expect.objectContaining({
                    type: 'UNIQUE',
                    label: 'Person',
                    properties: ['name'],
                    entitytype: 'NODE',
                    status: 'OPERATIONAL'
                })
            ])
        );        
        
        await graphName.constraintDrop("UNIQUE" as ConstraintType, "NODE" as EntityType, "Person", "name");
        await graphName.constraintDrop("MANDATORY" as ConstraintType, "NODE" as EntityType, "Person", "name");
        await graphName.constraintDrop("UNIQUE" as ConstraintType, "NODE" as EntityType, "Person", "v1", "v2");
        const remainingConstraints = await graphName.query("CALL db.constraints()");
        expect(remainingConstraints.data?.length).toBe(0)
    });

    it('Validate creation and deletion mandatory constraints on edges', async () => {
        await graphName.query("CREATE (:Person {name: 'Alice'})");
        await graphName.query("CREATE (:Person {name: 'Bob'})");
        await graphName.query(`
            MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
            CREATE (a)-[:KNOWS {since: 2020}]->(b)
            RETURN exists((a)-[:KNOWS]->(b)) as hasRelationship
        `);
        await graphName.query("CREATE INDEX ON :KNOWS(since)");
        await graphName.constraintCreate("MANDATORY" as ConstraintType, "RELATIONSHIP" as EntityType, "KNOWS", "since");
        const nodeConstraints = await graphName.query("CALL db.constraints()");
        expect(nodeConstraints.data?.length).toBe(1);
        expect(nodeConstraints.data?.[0]).toEqual(
            expect.objectContaining({
                type: 'MANDATORY',
                label: 'KNOWS',
                properties: [ 'since' ],
                entitytype: 'RELATIONSHIP',
                status: 'OPERATIONAL'
            })
        );
        await graphName.constraintDrop("MANDATORY" as ConstraintType, "RELATIONSHIP" as EntityType, "KNOWS", "since");
        const remainingConstraints = await graphName.query("CALL db.constraints()");
        expect(remainingConstraints.data?.length).toBe(0)
    });

    it('Throw an error when creating an existing unique constraint on node', async () => {
        await graphName.query(`CREATE (:Person {name: 'Alice'})`);
        await graphName.query("CREATE INDEX ON :Person(name)");
        await graphName.constraintCreate("UNIQUE" as ConstraintType, "NODE" as EntityType, "Person", "name");
        await expect(graphName.constraintCreate("UNIQUE" as ConstraintType, "NODE" as EntityType, "Person", "name")).rejects.toThrow();
    });

    it('Throw an error when creating an existing mandatory constraint on node', async () => {
        await graphName.query(`CREATE (:Person {name: 'Alice'})`);
        await graphName.query("CREATE INDEX ON :Person(name)");
        await graphName.constraintCreate("MANDATORY" as ConstraintType, "NODE" as EntityType, "Person", "name");
        await expect(graphName.constraintCreate("MANDATORY" as ConstraintType, "NODE" as EntityType, "Person", "name")).rejects.toThrow();
    });

    it('Throw an error when creating an existing mandatory constraint on edges', async () => {
        await graphName.query("CREATE (:Person {name: 'Alice'})");
        await graphName.query("CREATE (:Person {name: 'Bob'})");
        await graphName.query("MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS {since: 2020}]->(b)");
        await graphName.query("CREATE INDEX ON :KNOWS(since)");
        await graphName.constraintCreate("MANDATORY" as ConstraintType, "RELATIONSHIP" as EntityType, "KNOWS", "since");
        await expect(graphName.constraintCreate("MANDATORY" as ConstraintType, "RELATIONSHIP" as EntityType, "KNOWS", "since")).rejects.toThrow();
    });
});
