import { client } from './dbConnection';
import { expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import Graph, { ConstraintType, EntityType } from '../src/graph';

describe('Indices Tests', () => {
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

    it('Create and verify indices on a node label', async () => {
        await graphName.query(`CREATE (:label1)`);
        await graphName.query('CREATE INDEX ON :label1(property1)'); 
        await graphName.query('CREATE INDEX ON :label1(property2)');
        await graphName.query('CREATE INDEX ON :label1(property3)');
        await graphName.query('CREATE INDEX ON :label1(property4)');
        await graphName.query('CREATE INDEX ON :label1(property5)');

        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN label, properties');
        expect(result.data).toContainEqual({
            label: 'label1',
            properties: ['property1', 'property2', 'property3', 'property4', 'property5'],
        });
    });

    it('Create and verify an index on an edge label', async () => {
        await graphName.query(`CREATE (n1:label1 { property: "value1" })-[:edgeLabel1 { property1: "value1" }]->(n2:label2 { property: "value2" })`);
        await graphName.query('CREATE INDEX ON :edgeLabel1(property1)');
        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN label, properties');

        expect(result.data).toContainEqual({
            label: 'edgeLabel1',
            properties: ['property1'],
        });
    });

    it('Throw error when creating duplicate indices on node', async () => {
        await graphName.query('CREATE (:label1)');
        await graphName.query('CREATE INDEX ON :label1(property1)');
        await expect(graphName.query('CREATE INDEX ON :label1(property1)')).rejects.toThrow();
    });

    it('Throw error when creating duplicate indices on edges', async () => {
        await graphName.query('CREATE (:label1)-[:edgeLabel1 { property1: "value" }]->(:label2)'); 
        await graphName.query('CREATE INDEX ON :edgeLabel1(property1)');
        await expect(graphName.query('CREATE INDEX ON :edgeLabel1(property1)')).rejects.toThrow();
    });

    it('verify that an index on a node label is dropped successfully', async () => {
        await graphName.query('CREATE (:label1 { property1: "value" })');
        await graphName.query('CREATE INDEX ON :label1(property1)');
        await graphName.query('DROP INDEX ON :label1(property1)');
        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN *');
        const indices = result.data;
    
        expect(indices).not.toContainEqual(expect.objectContaining({ label: 'label1', properties: ['property1'] }));
    });
    
    it('verify that an index on a edge label is dropped successfully', async () => {
        await graphName.query('CREATE (:label1)-[:edgeLabel1 { property1: "value" }]->(:label2)');
        await graphName.query('CREATE INDEX ON :edgeLabel1(property1)');
        await graphName.query('DROP INDEX ON :edgeLabel1(property1)');

        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN *');
        const indices = result.data;
        expect(indices).not.toContainEqual(expect.objectContaining({ label: 'edgeLabel1', properties: ['property1'] }));
    });
});
