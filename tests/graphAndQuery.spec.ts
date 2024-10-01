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
    
});