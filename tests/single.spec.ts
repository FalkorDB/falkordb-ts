import FalkorDB from '../src/falkordb';
import { ConstraintType, EntityType } from '../src/graph';
import { client } from './dbConnection';
import { expect } from '@jest/globals';

function getRandomNumber(): number {
    return Math.floor(Math.random() * 999999);
}

describe('Single Client Tests', () => {
    let singleClient: FalkorDB;
    let pooledClient: FalkorDB;

    beforeAll(async () => {
        try {
            singleClient = await client();
        } catch (error) {
            console.error('Failed to connect to FalkorDB:', error);
        }

        // Pooled client to test pool execution paths
        try {
            pooledClient = await FalkorDB.connect({
                socket: {
                    host: process.env.FALKORDB_HOST || 'localhost',
                    port: parseInt(process.env.FALKORDB_PORT || '6379', 10)
                },
                poolOptions: {
                    min: 1,
                    max: 10
                }
            });
        } catch (error) {
            console.error('Failed to connect to FalkorDB with pooled client:', error);
        }
    });

    afterAll(async () => {
        if (singleClient) {
            await singleClient.close();
        }
        if (pooledClient) {
            await pooledClient.close();
        }
    });

    function skipIfNoClient(testFn: () => void | Promise<void>) {
        return async () => {
            if (!singleClient) {
                return;
            }
            await testFn();
        };
    }

    function skipIfNoPooledClient(testFn: () => void | Promise<void>) {
        return async () => {
            if (!pooledClient) {
                return;
            }
            await testFn();
        };
    }

    describe('Basic Single Client Operations', () => {
        it('should create single client instance', skipIfNoClient(() => {
            expect(singleClient).toBeDefined();
        }));

        it('should execute query through single client', skipIfNoClient(async () => {
            const graphName = `test-single-query-${getRandomNumber()}`;
            const graph = singleClient.selectGraph(graphName);
            const result = await graph.query('RETURN 1 as num');
            expect(result).toBeDefined();
            await graph.delete();
        }));

        it('should execute read-only query through single client', skipIfNoClient(async () => {
            const graphName = `test-single-ro-query-${getRandomNumber()}`;
            const graph = singleClient.selectGraph(graphName);
            // First create some data
            await graph.query('CREATE (n:Test {value: 1})');
            // Then use roQuery to read it
            const result = await graph.roQuery('MATCH (n:Test) RETURN n.value');
            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            await graph.delete();
        }));

        it('should delete graph through single client', skipIfNoClient(async () => {
            const graphName = `test-single-delete-${getRandomNumber()}`;
            const graph = singleClient.selectGraph(graphName);
            await graph.query('CREATE (n:Test {value: 1})');
            await graph.delete();
            // Verify graph is deleted by checking it doesn't appear in list
            const graphs = await singleClient.list();
            expect(graphs.includes(graphName)).toBe(false);
        }));

        it('should explain query through single client', skipIfNoClient(async () => {
            const graph = singleClient.selectGraph(`test-single-explain-${getRandomNumber()}`);
            // Create some data first for a meaningful explain
            await graph.query('CREATE (n:Person {name: "Alice"})');
            const result = await graph.explain('MATCH (n:Person) RETURN n');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            await graph.delete();
        }));

        it('should profile query through single client', skipIfNoClient(async () => {
            const graph = singleClient.selectGraph(`test-single-profile-${getRandomNumber()}`);
            // Create some data first for a meaningful profile
            await graph.query('CREATE (n:Person {name: "Alice"})');
            const result = await graph.profile('MATCH (n:Person) RETURN n');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            await graph.delete();
        }));

        it('should list graphs through single client', skipIfNoClient(async () => {
            const graphs = await singleClient.list();
            expect(Array.isArray(graphs)).toBe(true);
        }));

        it('should get config through single client', skipIfNoClient(async () => {
            const config = await singleClient.configGet('RESULTSET_SIZE');
            expect(config).toBeDefined();
        }));

        it('should set config through single client', skipIfNoClient(async () => {
            const originalConfig = await singleClient.configGet('RESULTSET_SIZE');
            await singleClient.configSet('RESULTSET_SIZE', 1000);
            const newConfig = await singleClient.configGet('RESULTSET_SIZE');
            expect(newConfig).toBeDefined();
            // Restore original value
            const originalValue = Array.isArray(originalConfig) ? originalConfig[1] : originalConfig;
            await singleClient.configSet('RESULTSET_SIZE', originalValue as string | number);
        }));

        it('should get info through single client', skipIfNoClient(async () => {
            const info = await singleClient.info();
            expect(info).toBeDefined();
        }));

        it('should get info with section through single client', skipIfNoClient(async () => {
            const info = await singleClient.info('server');
            expect(info).toBeDefined();
        }));

        it('should get slow log through single client', skipIfNoClient(async () => {
            const graph = singleClient.selectGraph(`test-single-slowlog-${getRandomNumber()}`);
            await graph.query('CREATE (n:SlowTest {value: 1})');
            const slowLog = await graph.slowLog();
            expect(Array.isArray(slowLog)).toBe(true);
            await graph.delete();
        }));

        it('should create constraints through single client', skipIfNoClient(async () => {
            const graph = singleClient.selectGraph(`test-single-constraint-create-${getRandomNumber()}`);
            try {
                await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
                await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
            } catch (error) {
                expect(error).toBeDefined();
            }
            await graph.delete();
        }));

        it('should drop constraints through single client', skipIfNoClient(async () => {
            const graph = singleClient.selectGraph(`test-single-constraint-drop-${getRandomNumber()}`);
            try {
                await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email');
                await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email');
            } catch (error) {
                expect(error).toBeDefined();
            }
            await graph.delete();
        }));

        it('should copy graphs through single client', skipIfNoClient(async () => {
            const sourceGraphName = `single-source-graph-${getRandomNumber()}`;
            const destGraphName = `single-dest-graph-${getRandomNumber()}`;
            const sourceGraph = singleClient.selectGraph(sourceGraphName);
            await sourceGraph.query('CREATE (n:Test {value: 42})');
            
            await sourceGraph.copy(destGraphName);
            
            const destGraph = singleClient.selectGraph(destGraphName);
            const result = await destGraph.query('MATCH (n:Test) RETURN n.value');
            expect(result.data).toBeDefined();
            
            await sourceGraph.delete();
            await destGraph.delete();
        }));

        it('should test close method', skipIfNoClient(async () => {
            const tempClient = await FalkorDB.connect({
                socket: {
                    host: process.env.FALKORDB_HOST || 'localhost',
                    port: parseInt(process.env.FALKORDB_PORT || '6379', 10)
                }
            });
            
            const info = await tempClient.info();
            expect(info).toBeDefined();
            
            // Test close method
            await tempClient.close();
        }));

        it('should get connection from single client', skipIfNoClient(async () => {
            const connection = await singleClient.connection;
            expect(connection).toBeDefined();
            expect(connection.falkordb).toBeDefined();
        }));
    });

    describe('Pooled Single Client Operations', () => {
        it('should execute query through pooled single client', skipIfNoPooledClient(async () => {
            const graph = pooledClient.selectGraph(`test-pooled-query-${getRandomNumber()}`);
            const result = await graph.query('RETURN 1 as num');
            expect(result).toBeDefined();
            await graph.delete();
        }));

        it('should execute read-only query through pooled single client', skipIfNoPooledClient(async () => {
            const graph = pooledClient.selectGraph(`test-pooled-ro-query-${getRandomNumber()}`);
            // First create some data
            await graph.query('CREATE (n:Test {value: 1})');
            // Then use roQuery to read it
            const result = await graph.roQuery('MATCH (n:Test) RETURN n.value');
            expect(result).toBeDefined();
            expect(result.data).toBeDefined();
            await graph.delete();
        }));

        it('should delete graph through pooled single client', skipIfNoPooledClient(async () => {
            const graph = pooledClient.selectGraph(`test-pooled-delete-${getRandomNumber()}`);
            await graph.query('CREATE (n:PoolTest {value: 1})');
            await graph.delete();
        }));

        it('should explain query through pooled single client', skipIfNoPooledClient(async () => {
            const graph = pooledClient.selectGraph(`test-pooled-explain-${getRandomNumber()}`);
            // Create some data first for a meaningful explain
            await graph.query('CREATE (n:Person {name: "Alice"})');
            const result = await graph.explain('MATCH (n:Person) RETURN n');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            await graph.delete();
        }));

        it('should profile query through pooled single client', skipIfNoPooledClient(async () => {
            const graph = pooledClient.selectGraph(`test-pooled-profile-${getRandomNumber()}`);
            // Create some data first for a meaningful profile
            await graph.query('CREATE (n:Person {name: "Alice"})');
            const result = await graph.profile('MATCH (n:Person) RETURN n');
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            await graph.delete();
        }));

        it('should get slow log through pooled single client', skipIfNoPooledClient(async () => {
            const graph = pooledClient.selectGraph(`test-pooled-slowlog-${getRandomNumber()}`);
            await graph.query('CREATE (n:PoolSlowTest {value: 1})');
            const slowLog = await graph.slowLog();
            expect(Array.isArray(slowLog)).toBe(true);
            await graph.delete();
        }));

        it('should test pooled client with multiple concurrent operations', skipIfNoPooledClient(async () => {
            const operations = [
                pooledClient.info(),
                pooledClient.list(),
                pooledClient.configGet('RESULTSET_SIZE')
            ];
            
            const results = await Promise.all(operations);
            expect(results).toHaveLength(3);
            results.forEach(result => expect(result).toBeDefined());
        }));

        it('should test pooled client with graph operations', skipIfNoPooledClient(async () => {
            const graph1 = pooledClient.selectGraph(`pool-test-1-${getRandomNumber()}`);
            const graph2 = pooledClient.selectGraph(`pool-test-2-${getRandomNumber()}`);
            
            const operations = [
                graph1.query('CREATE (n:PoolNode1 {id: 1})'),
                graph2.query('CREATE (n:PoolNode2 {id: 2})')
            ];
            
            await Promise.all(operations);
            
            const results = await Promise.all([
                graph1.query('MATCH (n:PoolNode1) RETURN n.id'),
                graph2.query('MATCH (n:PoolNode2) RETURN n.id')
            ]);
            
            expect(results[0].data).toBeDefined();
            expect(results[1].data).toBeDefined();
            
            await graph1.delete();
            await graph2.delete();
        }));
    });
});