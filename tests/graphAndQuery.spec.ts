import { client } from './dbConnection';
import { expect } from '@jest/globals';

describe('FalkorDB Execute Query', () => {
    let clientInstance: any;

    beforeAll(async () => {
        clientInstance = await client();
    });

    afterAll(async () => {
       await clientInstance.close()
    });

    it('Create a graph and check for its existence', async () => {
        const graph = clientInstance.selectGraph('testGraph');
        await graph.query("CREATE (:Person {name:'Alice'})");
        const currCount = await clientInstance.list()
        const exists = currCount.includes("testGraph");
        await graph.delete()
        expect(exists).toBe(true)
    });

    it('Execute a query and return the correct results', async () => {
        const graph = clientInstance.selectGraph('testGraph');
        await graph.query("CREATE (:Person {name:'Alice'})");
        const result = await graph.query("MATCH (n:Person) RETURN n.name");
        await graph.delete()
        expect(result?.data[0]['n.name']).toBe('Alice');
    });
    
    it('Copy an existing graph and validate the existence of the new graph', async () => {
        const graph = clientInstance.selectGraph('testGraph');
        await graph.query("CREATE (:Person {name:'Alice'})");
        await graph.copy("graphcopy")
        await graph.delete()
        const copyGraph = await clientInstance.selectGraph("graphcopy");
        const currCount = await clientInstance.list();
        const exists = currCount.includes("graphcopy");
        await copyGraph.delete();
        expect(exists).toBe(true)    
    });

    it('Execute a roQuery and return the correct results', async () => {
        const graph = clientInstance.selectGraph('testGraph');
        await graph.query("CREATE (:Person {name:'Alice'})");
        const result = await graph.query("MATCH (n:Person) RETURN n.name");
        await graph.delete()
        expect(result?.data[0]['n.name']).toBe('Alice');
    });

    it('fail test: when trying to execute a write query with roQuery', async () => {
        const graph = clientInstance.selectGraph('testGraph');
        await graph.query("CREATE (:Person {name:'Alice'})");
        try {
            await graph.roQuery("CREATE (:Person {name:'Bob'})");
        } catch (error) {
            expect(error).toBeDefined();
        }
        await graph.delete();
    });

    it('fail test: when executing an invalid query', async () => {
        const graph = clientInstance.selectGraph('testGraph');
        try {
            await graph.query("INVALID QUERY SYNTAX");
        } catch (error) {
            expect(error).toBeDefined();
        }
    });
});