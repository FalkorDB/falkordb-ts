import { client } from './dbConnection';
import { expect } from '@jest/globals';

describe('Constraint Tests', () => {
    let clientInstance: any;

    beforeAll(async () => {
        clientInstance = await client();
    });

    afterAll(async () => {
       await clientInstance.close()
    });

    it('Validate creation and deletion of unique and mandatory constraints on nodes', async () => {
        const graphName = clientInstance.selectGraph("constraints");
        await graphName.query(`CREATE (:Person {name: 'Alice'})`);
        await graphName.query("CREATE INDEX ON :Person(name)");
        await graphName.constraintCreate("UNIQUE", "NODE", "Person", "name");
        await graphName.constraintCreate("MANDATORY", "NODE", "Person", "name");
        await graphName.query("CREATE INDEX ON :Person(v1, v2)");
        await graphName.constraintCreate("UNIQUE", "NODE", "Person", "v1", "v2");
        const nodeConstraints = await graphName.query("CALL db.constraints()");
        expect(nodeConstraints.data.length).toBe(3);
        await graphName.constraintDrop("UNIQUE", "NODE", "Person", "name");
        await graphName.constraintDrop("MANDATORY", "NODE", "Person", "name");
        await graphName.constraintDrop("UNIQUE", "NODE", "Person", "v1", "v2");
        const remainingConstraints = await graphName.query("CALL db.constraints()");
        expect(remainingConstraints.data.length).toBe(0)
        await graphName.delete()
    });

    it('Validate creation and deletion mandatory constraints on edges', async () => {
        const graphName = clientInstance.selectGraph("constraints");
        await graphName.query("CREATE (:Person {name: 'Alice'})");
        await graphName.query("CREATE (:Person {name: 'Bob'})");
        await graphName.query("MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS {since: 2020}]->(b)");
        await graphName.query("CREATE INDEX ON :KNOWS(since)");
        await graphName.constraintCreate("MANDATORY", "RELATIONSHIP", "KNOWS", "since");
        const nodeConstraints = await graphName.query("CALL db.constraints()");
        expect(nodeConstraints.data.length).toBe(1);
        await graphName.constraintDrop("MANDATORY", "RELATIONSHIP", "KNOWS", "since");
        const remainingConstraints = await graphName.query("CALL db.constraints()");
        expect(remainingConstraints.data.length).toBe(0)
        await graphName.delete()
    });

    it('Throw an error when creating an existing unique constraint on node', async () => {
        const graphName = clientInstance.selectGraph("constraints");
        await graphName.query(`CREATE (:Person {name: 'Alice'})`);
        await graphName.query("CREATE INDEX ON :Person(name)");
        await graphName.constraintCreate("UNIQUE", "NODE", "Person", "name");
        await expect(graphName.constraintCreate("UNIQUE", "NODE", "Person", "name")).rejects.toThrow();
        await graphName.delete()
    });

    it('Throw an error when creating an existing mandatory constraint on node', async () => {
        const graphName = clientInstance.selectGraph("constraints");
        await graphName.query(`CREATE (:Person {name: 'Alice'})`);
        await graphName.query("CREATE INDEX ON :Person(name)");
        await graphName.constraintCreate("MANDATORY", "NODE", "Person", "name");
        await expect(graphName.constraintCreate("MANDATORY", "NODE", "Person", "name")).rejects.toThrow();
        await graphName.delete()
    });

    it('Throw an error when creating an existing mandatory constraint on edges', async () => {
        const graphName = clientInstance.selectGraph("constraints");
        await graphName.query("CREATE (:Person {name: 'Alice'})");
        await graphName.query("CREATE (:Person {name: 'Bob'})");
        await graphName.query("MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'}) CREATE (a)-[:KNOWS {since: 2020}]->(b)");
        await graphName.query("CREATE INDEX ON :KNOWS(since)");
        await graphName.constraintCreate("MANDATORY", "RELATIONSHIP", "KNOWS", "since");
        await expect(graphName.constraintCreate("MANDATORY", "RELATIONSHIP", "KNOWS", "since")).rejects.toThrow();
        await graphName.delete()
    });
});
