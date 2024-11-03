import { client } from './dbConnection';
import { expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import Graph from '../src/graph';

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
        try {
            graphName = clientInstance.selectGraph("graph");
        } catch (error) {
            console.error('Failed to select graph:', error);
            throw error;
        }
    })

    afterEach(async () => {
        try {
            await graphName.delete()
        } catch (error) {
            console.error('Failed to delete graph:', error);
            throw error;
        }
    })

    it('Create and verify indices on a node label', async () => {
        await graphName.query(`CREATE (:label1)`);
        const properties = ['property1', 'property2', 'property3', 'property4', 'property5'];
        for (let property of properties){
            await graphName.createNodeRangeIndex('label1', property)
        }
        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN label, properties');
        
        expect(result.data).toContainEqual({
            label: 'label1',
            properties: ['property1', 'property2', 'property3', 'property4', 'property5'],
        });
    });

    it('Create and verify an index on an edge label', async () => {
        await graphName.query(`CREATE (n1:label1 { property: "value1" })-[:edgeLabel1 { property1: "value1" }]->(n2:label2 { property: "value2" })`);
        await graphName.createEdgeRangeIndex('edgeLabel1', 'property1');
        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN label, properties');

        expect(result.data).toContainEqual({
            label: 'edgeLabel1',
            properties: ['property1'],
        });
    });

    it('Throw error when creating duplicate indices on node', async () => {
        await graphName.query('CREATE (:label1)');
        await graphName.createNodeRangeIndex('label1', 'property1')
        await expect(graphName.createNodeRangeIndex('label1', 'property1')).rejects.toThrow();
    });

    it('Throw error when creating duplicate indices on edges', async () => {
        await graphName.query('CREATE (:label1)-[:edgeLabel1 { property1: "value" }]->(:label2)'); 
        await graphName.createEdgeRangeIndex('edgeLabel1', 'property1');
        await expect(graphName.createEdgeRangeIndex('edgeLabel1', 'property1')).rejects.toThrow();
    });

    it('verify that an index on a node label is dropped successfully', async () => {
        await graphName.query('CREATE (:label1 { property1: "value" })');
        await graphName.createNodeRangeIndex('label1', 'property1')
        await graphName.dropNodeRangeIndex('label1', 'property1')
        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN *');
        const indices = result.data;
    
        expect(indices).not.toContainEqual(expect.objectContaining({ label: 'label1', properties: ['property1'] }));
    });
    
    it('verify that an index on a edge label is dropped successfully', async () => {
        await graphName.query('CREATE (:label1)-[:edgeLabel1 { property1: "value" }]->(:label2)');
        await graphName.createEdgeRangeIndex('edgeLabel1', 'property1')
        await graphName.dropEdgeRangeIndex('edgeLabel1', 'property1')

        const result = await graphName.roQuery('CALL db.indexes() YIELD label, properties RETURN *');
        const indices = result.data;
        
        expect(indices).not.toContainEqual(expect.objectContaining({ label: 'edgeLabel1', properties: ['property1'] }));
    });

    it('Validate addition and removal of multiple index types on a node property', async () => {
        await graphName.query('CREATE (:label1)');
        await graphName.createNodeRangeIndex('label1', 'property1');
        await graphName.createNodeFulltextIndex('label1', 'property1');
        await graphName.createNodeVectorIndex('label1', 32, 'euclidean', 'property1');
      
        const indicesAfterAddition: any = await graphName.roQuery('CALL db.indexes() YIELD label, properties, types, entitytype, status');
        const indices = indicesAfterAddition.data;
        
        expect(indices[0].types.property1).toEqual(expect.arrayContaining([ 'RANGE', 'FULLTEXT', 'VECTOR' ]));

        await graphName.dropNodeRangeIndex('label1', 'property1');
        await graphName.dropNodeFulltextIndex('label1', 'property1');
        await graphName.dropNodeVectorIndex('label1', 'property1');

        const indicesAfterRemoval: any = await graphName.roQuery('CALL db.indexes()');
        expect(indicesAfterRemoval.data).toEqual([])   
    });
      
    it('Validate addition and removal of multiple index types on an edge property', async () => {
        await graphName.query('CREATE (:label1)-[:edgeLabel1 { property1: "value" }]->(:label2)');
        await graphName.createEdgeRangeIndex('edgeLabel1', 'property1');
        await graphName.createEdgeFulltextIndex('edgeLabel1', 'property1');
        await graphName.createEdgeVectorIndex('edgeLabel1', 32, 'euclidean', 'property1');

        const indicesAfterAddition: any = await graphName.roQuery('CALL db.indexes()');
        const edgeIndex = indicesAfterAddition.data[0];
        
        expect(edgeIndex.entitytype).toBe('RELATIONSHIP');
        expect(edgeIndex.types.property1).toEqual(expect.arrayContaining([ 'RANGE', 'FULLTEXT', 'VECTOR' ]));
        
        await graphName.dropEdgeRangeIndex('edgeLabel1', 'property1');
        await graphName.dropEdgeFulltextIndex('edgeLabel1', 'property1');
        await graphName.dropEdgeVectorIndex('edgeLabel1', 'property1');

        const indicesAfterRemoval: any = await graphName.roQuery('CALL db.indexes()');
        expect(indicesAfterRemoval.data).toEqual([])  
    });

});
