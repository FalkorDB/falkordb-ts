import { client } from './dbConnection';
import { expect } from '@jest/globals';
import { getRandomNumber } from './utils';

describe('FalkorDB Execute Query', () => {
    let clientInstance: any;

    beforeAll(async () => {
        clientInstance = await client();
    });

    afterAll(async () => {
       await clientInstance.close()
    });

    it('Create a graph and check for its existence', async () => {
        const graphName = `graph_${getRandomNumber()}`
        const graph = clientInstance.selectGraph(graphName);
        await graph.query("CREATE (:Person {name:'Alice'})");
        const currCount = await clientInstance.list()
        const exists = currCount.includes(graphName);
        await graph.delete()
        expect(exists).toBe(true)
    });

    it('Execute a query and return the correct results', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        await graph.query("CREATE (:Person {name:'Alice'})");
        const result = await graph.query("MATCH (n:Person) RETURN n.name");
        await graph.delete()
        expect(result?.data[0]['n.name']).toBe('Alice');
    });
    
    it('Copy an existing graph and validate the existence of the new graph', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
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
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        await graph.query("CREATE (:Person {name:'Alice'})");
        const result = await graph.query("MATCH (n:Person) RETURN n.name");
        await graph.delete()
        expect(result?.data[0]['n.name']).toBe('Alice');
    });

    it('fail test: when trying to execute a write query with roQuery', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        await graph.query("CREATE (:Person {name:'Alice'})");
        await expect(graph.roQuery("CREATE (:Person {name:'Bob'})")).rejects.toThrow();
        await graph.delete();
    });

    it('fail test: when executing an invalid query', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        await expect(graph.query("INVALID QUERY SYNTAX")).rejects.toThrow();
    });

    it('creates two nodes and a relationship, then retrieves and validates nodes and relationship', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const query = `
            CREATE (n1:Person {name: 'Alice', age: 30})-[r:KNOWS]->(n2:Person {name: 'Bob', age: 25})
            RETURN n1, n2, r
        `;
        const result = await graph.query(query);

        expect(result.data).toHaveLength(1);
        
        const [row] = result.data;
        const { n1, n2, r } = row;
        
        // Check node n1 properties
        expect(n1.labels).toContain('Person');
        expect(n1.properties.name).toBe('Alice');
        expect(n1.properties.age).toBe(30);
    
        // Check node n2 properties
        expect(n2.labels).toContain('Person');
        expect(n2.properties.name).toBe('Bob');
        expect(n2.properties.age).toBe(25);
    
        // Check the edge properties
        expect(r.relationshipType).toBe('KNOWS');
        expect(r.sourceId).toBe(n1.id);
        expect(r.destinationId).toBe(n2.id);
        await graph.delete()
    });

    it('creates nodes with array properties and verifies query results', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const query = `
            CREATE (n:Person {name: 'Alice', hobbies: ['Reading', 'Hiking', 'Cooking']})
            RETURN n
        `;
        const result = await graph.query(query);

        // Verify returned node
        expect(result.data).toHaveLength(1);
        const [row] = result.data;
        const { n } = row;

        // Check node properties
        expect(n.labels).toContain('Person');
        expect(n.properties.name).toBe('Alice');
        expect(n.properties.hobbies).toEqual(['Reading', 'Hiking', 'Cooking']);
        await graph.delete()
    });

    it('validates the creation of a path between nodes with edges', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const query = `
            CREATE (n1:Person {name: 'Alice', age: 30})-[r:KNOWS {since: 2020}]->(n2:Person {name: 'Bob', age: 25})
            RETURN n1, n2, r
        `;
        await graph.query(query);

        // Query to retrieve the path
        const pathQuery = "MATCH p=(n1:Person)-[r:KNOWS]->(n2:Person) RETURN p";
        const result = await graph.query(pathQuery);

        // Check the structure of the returned path
        expect(result.data).toHaveLength(1);
        const [row] = result.data;
        const { p } = row;

        // Validate nodes and relationship in the path
        expect(p.nodes).toHaveLength(2);
        expect(p.edges).toHaveLength(1);
        expect(p.edges[0].relationshipType).toBe('KNOWS');
        expect(p.edges[0].properties.since).toBe(2020);
        expect(p.nodes[0].properties.name).toBe('Alice');
        expect(p.nodes[1].properties.name).toBe('Bob');
        await graph.delete()
    });

    it('runs a query with various parameter types and checks if they return correctly', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const params = [1, 5.4, "hello world", true, false, null, ["apple", "banana", "cherry"], '\\\" RETURN 1122 //'];
    
        for (const param of params) {
            const query = `RETURN ${JSON.stringify(param)} AS param`;
            const result = await graph.query(query);
            expect(result.data).toEqual([{ param }]);
        }
        await graph.delete();
    });
      
    it('runs a query and validates the returned map structure', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const query = `RETURN {name: 'John', age: 29, isEmployed: True, skills: ['Python', 'JavaScript'], salary: null, address: {city: 'New York', zip: 10001}}`;
        const result = await graph.query(query);
    
        expect(result.data).toHaveLength(1);
        const mapKey = Object.keys(result.data[0])[0];
        const map = result.data[0][mapKey];
        
        expect(map.name).toBe('John');
        expect(map.age).toBe(29);
        expect(map.isEmployed).toBe(true);
        expect(map.skills).toEqual(['Python', 'JavaScript']);
        expect(map.salary).toBeNull();
        expect(map.address.city).toBe('New York');
        expect(map.address.zip).toBe(10001);
    
        await graph.delete();
    });

    it('tests geographic points with latitude and longitude values', async () => {
        const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const query = `RETURN point({latitude: 40.7128, longitude: -74.0060}) AS point`;
        const result = await graph.query(query);
        const createdPoint = result.data[0].point;
        const fixedLat = parseFloat((createdPoint.latitude).toFixed(4))
        const fixedLong = parseFloat((createdPoint.longitude).toFixed(4))
        expect(fixedLat).toBe(40.7128);
        expect(fixedLong).toBe(-74.0060);
        await graph.delete();
    });

    it('Create and delete an index on a property and handle duplicate operations', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("CREATE (:Person {name: 'Alice', age: 30}), (:Person {name: 'Bob', age: 25})");
      await graph.query("CREATE INDEX ON :Person(name)");
      const indexResult = await graph.query("CALL db.indexes");
      expect(indexResult.data[0].label).toBe('Person');
      expect(indexResult.data[0].properties).toEqual(['name']);
      await expect(graph.query("CREATE INDEX ON :Person(name)")).rejects.toThrow();
      await graph.query("DROP INDEX ON :Person(name)");
      const updatedIndexResult = await graph.query("CALL db.indexes");
      expect(updatedIndexResult).not.toContainEqual(expect.objectContaining({ label: 'Person', properties: ['name'] }));
      await graph.delete();
    });
  
    it('Validate correct string representations of nodes and edges in query results', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("CREATE (n1:Person {name: 'Alice'})-[:KNOWS]->(n2:Person {name: 'Bob'})");
      const query = 'MATCH (n1)-[r]->(n2) RETURN n1, r, n2';
      const result = await graph.query(query);
      expect(result.data).not.toBeNull();
    
      const node1 = result.data[0].n1;
      const edge = result.data[0].r;
      const node2 = result.data[0].n2;
        
      expect(typeof node1.toString()).toBe('string');
      expect(typeof edge.toString()).toBe('string');
      expect(typeof node2.toString()).toBe('string');
      await graph.delete();
    });

    it('Validate absence of matching edges and return null for non-existing relationships', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("CREATE (n:Person {name: 'Alice'})");
      const query = 'MATCH (n:Person) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m';
      const result = await graph.query(query);
      expect(result.data).not.toBeNull();
      const matchResult = result.data[0];
      expect(matchResult.r).toBeNull();
      expect(matchResult.m).toBeNull();
      await graph.delete();
    });

    it('Validate cached query results after the first run', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("CREATE (n:Person {name: 'Alice'})");
      const query = 'MATCH (n:Person) RETURN n';
      const firstResult = await graph.query(query);
      expect(firstResult.data).not.toBeNull();
      const secondResult = await graph.query(query);
      expect(secondResult.metadata[0]).toContain('Cached execution: 1');
      await graph.delete();
    });

    it('Verify slow query logging', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      const createQuery = `CREATE (:Director {name:'Christopher Nolan'})-[:DIRECTED]->(:Movie {title:'Inception'}),
                            (:Director {name:'Steven Spielberg'})-[:DIRECTED]->(:Movie {title:'Jurassic Park'}),
                            (:Director {name:'Quentin Tarantino'})-[:DIRECTED]->(:Movie {title:'Pulp Fiction'})`;
      await graph.query(createQuery);
      const slowLogResults = await graph.slowLog();
      expect(slowLogResults).toBeDefined();
      expect(slowLogResults[0].command).toBe("GRAPH.QUERY"); 
      expect(slowLogResults[0].query).toBe(createQuery);
      expect(slowLogResults[0].took).toBeGreaterThan(0);
      await graph.delete();
    });

    it('Assert query execution time exceeds 1-sec limit', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("UNWIND range(0, 1000) AS val CREATE (:Node {v: val})");
      const result = await graph.query("MATCH (a), (b), (c), (d) RETURN *");
      const executionTimeStr = result.metadata[1];
      const executionTime = parseFloat(executionTimeStr.split(': ')[1]);
      expect(() => { expect(executionTime).toBeLessThan(1)}).toThrow();
      await graph.delete();
    });

    it('Create and match nodes with multiple labels', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("CREATE (a:Person:Employee {name: 'Alice', age: 30})");
      await graph.query("CREATE (b:Person:Manager {name: 'Bob', age: 45})");
      const resultA = await graph.roQuery("MATCH (n:Person:Employee {name: 'Alice'}) RETURN n");
      const resultB = await graph.roQuery("MATCH (n:Person:Manager {name: 'Bob'}) RETURN n");
      expect(resultA.data.length).toBe(1);
      expect(resultA.data[0].n.properties.name).toBe('Alice');
      expect(resultB.data.length).toBe(1);
      expect(resultB.data[0].n.properties.name).toBe('Bob');
      await graph.delete();
    });

    it('Verify that client cache stays in sync with simple node creation and query', async () => {
      const graphA = clientInstance.selectGraph("cache-sync");
      const graphB = clientInstance.selectGraph("cache-sync");
      await graphA.query("CREATE (:LabelA)");
      await graphB.query("CREATE (:LabelB)");
    
      const resultA = await graphA.query("MATCH (n) RETURN n");
      expect(resultA.data.length).toBe(2);
      await graphB.delete();
      await graphA.query("CREATE (:LabelC)");
      const resultB = await graphA.query("MATCH (n) RETURN n");
      expect(resultB.data.length).toBe(1);
      await graphA.delete();
    });
    
    it('Generate and verify the query execution plan', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      await graph.query("CREATE (:Person {name: 'Alice'})");
      const executionPlan = await graph.explain("MATCH (n:Person) RETURN n");
      expect(executionPlan).toContain('Results');
      expect(executionPlan).toContain('    Project');
      expect(executionPlan).toContain('        Node By Label Scan | (n:Person)');
      await graph.delete();
    });

    it('Validates the execution plan generated from a single query', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
      const createQuery = `
          CREATE
              (:Rider {name:'Valentino Rossi'})-[:rides]->(:Team {name:'Yamaha'}),
              (:Rider {name:'Dani Pedrosa'})-[:rides]->(:Team {name:'Honda'}),
              (:Rider {name:'Andrea Dovizioso'})-[:rides]->(:Team {name:'Ducati'})
      `;
      await graph.query(createQuery);

      const result = await graph.explain(
          `MATCH (r:Rider)-[:rides]->(t:Team)
          WHERE t.name = $name
          RETURN r.name, t.name`, 
          { name: "Yehuda" }
      );
      const expected = "ResultsProjectConditionalTraverse|(t)->(r:Rider)FilterNodeByLabelScan|(t:Team)";
      const actualOutput = result.toString().replace(/[\s,]+/g, '');
      expect(actualOutput).toEqual(expected);
      await graph.delete();
    });

    it('Validates the execution plan generated from multiple queries combined with a UNION clause', async () => {
      const graph = clientInstance.selectGraph(`graph_${getRandomNumber()}`);
        const createQuery = `
            CREATE
                (:Rider {name:'Valentino Rossi'})-[:rides]->(:Team {name:'Yamaha'}),
                (:Rider {name:'Dani Pedrosa'})-[:rides]->(:Team {name:'Honda'}),
                (:Rider {name:'Andrea Dovizioso'})-[:rides]->(:Team {name:'Ducati'})
        `;
        await graph.query(createQuery);
        const result = await graph.explain(
            `MATCH (r:Rider)-[:rides]->(t:Team)
            WHERE t.name = $name
            RETURN r.name, t.name
            UNION
            MATCH (r:Rider)-[:rides]->(t:Team)
            WHERE t.name = $name
            RETURN r.name, t.name`,
            { name: "Yamaha" },
        );
        const expected = `ResultsDistinctJoinProjectConditionalTraverse|(t)->(r:Rider)FilterNodeByLabelScan|(t:Team)ProjectConditionalTraverse|(t)->(r:Rider)FilterNodeByLabelScan|(t:Team)`;
        const actualOutput = result.toString().replace(/[\s,]+/g, '');
        expect(actualOutput).toEqual(expected);
        await graph.delete();
    });
   
});