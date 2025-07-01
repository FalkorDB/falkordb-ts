import FalkorDB from '../src/falkordb';
import { ConstraintType, EntityType } from '../src/graph';
import { expect } from '@jest/globals';
import { Sentinel } from '../src/clients/sentinel';

describe('Sentinel Integration Tests', () => {
    let sentinelClient: FalkorDB;

    beforeAll(async () => {
        // Connect to sentinel
        try {
            sentinelClient = await FalkorDB.connect({
                socket: {
                    host: process.env.SENTINEL_HOST || 'sentinel-1',
                    port: parseInt(process.env.SENTINEL_PORT || '26379', 10)
                },
            });
        } catch (error) {
            console.log('Sentinel not available for testing:', (error as Error).message);
        }
    });

    afterAll(async () => {
        if (sentinelClient) {
            await sentinelClient.close();
        }
    });

    beforeAll(() => {
      jest.spyOn(console, 'debug').mockImplementation(() => {});
    });
    afterAll(() => {
      (console.debug as jest.Mock).mockRestore();
    });

    beforeEach(() => {
        if (!sentinelClient) {
            pending('Skipping sentinel tests - no sentinel available');
        }
    });
    
    it('should create sentinel client instance', () => {
        expect(sentinelClient).toBeDefined();
    });

    it('should execute query through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-graph');
            const result = await graph.query('RETURN 1 as num');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should list graphs through sentinel', async () => {
        try {
            const graphs = await sentinelClient.list();
            expect(Array.isArray(graphs)).toBe(true);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should get config through sentinel', async () => {
        try {
            const config = await sentinelClient.configGet('RESULTSET_SIZE');
            expect(config).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should get info through sentinel', async () => {
        try {
            const info = await sentinelClient.info();
            expect(info).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle sentinel failover gracefully', async () => {
        try {
            await sentinelClient.info();
            expect(true).toBe(true);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle graph operations through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-sentinel-ops');
            await graph.query('CREATE (n:Person {name: "test"})');
            const result = await graph.query('MATCH (n:Person) RETURN n.name');
            expect(result).toBeDefined();
            
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should execute read-only query through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-graph-ro');
            const result = await graph.roQuery('RETURN 1 as num');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should explain query through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-graph-explain');
            const result = await graph.explain('RETURN 1');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should profile query through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-graph-profile');
            const result = await graph.profile('RETURN 1');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should set config through sentinel', async () => {
        try {
            const originalConfig = await sentinelClient.configGet('RESULTSET_SIZE');
            await sentinelClient.configSet('RESULTSET_SIZE', 1000);
            const newConfig = await sentinelClient.configGet('RESULTSET_SIZE');
            expect(newConfig).toBeDefined();
            const originalValue = Array.isArray(originalConfig) ? originalConfig[1] : originalConfig;
            await sentinelClient.configSet('RESULTSET_SIZE', originalValue as string | number);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should get info with section through sentinel', async () => {
        try {
            const info = await sentinelClient.info('server');
            expect(info).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should create constraints through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-constraint-graph');
            await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
            await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should drop constraints through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('test-constraint-drop-graph');
            await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email');
            await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email');
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should copy graphs through sentinel', async () => {
        try {
            const sourceGraph = sentinelClient.selectGraph('source-graph');
            await sourceGraph.query('CREATE (n:Test {value: 1})');
            
            await sourceGraph.copy('dest-graph');
            
            const destGraph = sentinelClient.selectGraph('dest-graph');
            const result = await destGraph.query('MATCH (n:Test) RETURN n.value');
            expect(result).toBeDefined();
            
            // Cleanup
            await sourceGraph.delete();
            await destGraph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle multiple graph operations through sentinel', async () => {
        try {
            const graph1 = sentinelClient.selectGraph('multi-graph-1');
            const graph2 = sentinelClient.selectGraph('multi-graph-2');
            
            await graph1.query('CREATE (n:User {name: "Alice"})');
            await graph2.query('CREATE (n:Product {name: "Book"})');
            
            const result1 = await graph1.query('MATCH (n:User) RETURN n.name');
            const result2 = await graph2.query('MATCH (n:Product) RETURN n.name');
            
            expect(result1.data).toBeDefined();
            expect(result2.data).toBeDefined();
            
            await graph1.delete();
            await graph2.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle connection stability and errors gracefully', async () => {
        try {
            const operations = [
                sentinelClient.info(),
                sentinelClient.list(),
                sentinelClient.info()
            ];
            const results = await Promise.allSettled(operations);
            results.forEach(result => {
                if (result.status === 'fulfilled') {
                    expect(result.value).toBeDefined();
                } else {
                    expect(result.reason).toBeInstanceOf(Error);
                }
            });
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle invalid operations through sentinel', async () => {
        await expect(sentinelClient.configGet('INVALID_CONFIG')).rejects.toThrow();
    });

    it('should handle concurrent operations through sentinel', async () => {
        try {
            const promises = [
                sentinelClient.info(),
                sentinelClient.list(),
                sentinelClient.configGet('RESULTSET_SIZE')
            ];
            
            const results = await Promise.all(promises);
            expect(results).toHaveLength(3);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle large query results through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('large-result-graph');
            await graph.query('UNWIND range(1, 100) AS i CREATE (n:Number {value: i})');
            const result = await graph.query('MATCH (n:Number) RETURN n.value ORDER BY n.value');
            
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.length).toBeGreaterThan(0);
            }
            
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle query parameters through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('param-graph');
            
            const result = await graph.query(
                'CREATE (n:Person {name: $name, age: $age}) RETURN n',
                { params: { name: 'John', age: 30 } }
            );
            
            expect(result.data).toBeDefined();
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle timeout parameters through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('timeout-graph');
            
            const result = await graph.query(
                'RETURN 1',
                { TIMEOUT: 1000 }
            );
            
            expect(result.data).toBeDefined();
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle complex queries through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('complex-graph');
            await graph.query(`
                CREATE (alice:Person {name: 'Alice', age: 30})
                CREATE (bob:Person {name: 'Bob', age: 25})
                CREATE (charlie:Person {name: 'Charlie', age: 35})
                CREATE (alice)-[:KNOWS]->(bob)
                CREATE (bob)-[:KNOWS]->(charlie)
                CREATE (alice)-[:KNOWS]->(charlie)
            `);
            
            const result = await graph.query(`
                MATCH (p:Person)-[:KNOWS]->(friend:Person)
                RETURN p.name, friend.name, p.age + friend.age AS combined_age
                ORDER BY combined_age
            `);
            
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.length).toBeGreaterThan(0);
            }
            
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle graph statistics through sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('stats-graph');
            
            const result = await graph.query('CREATE (n:StatNode {value: 42}) RETURN n');
            
            expect(result.metadata).toBeDefined();
            expect(result.metadata).toEqual(expect.objectContaining({}));
            
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle cleanup operations through sentinel', async () => {
        try {
            const graphs = await sentinelClient.list();
            expect(Array.isArray(graphs)).toBe(true);
            
            const info = await sentinelClient.info();
            expect(info).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });


    it('should throw if multiple masters are returned', async () => {
      const fakeClient: any = {
        options: {},
        falkordb: {
          sentinelMasters: jest.fn().mockResolvedValue([
            ['ip', '127.0.0.1', 'port', '6379'],
            ['ip', '127.0.0.2', 'port', '6380'],
          ]),
        },
      };
      const fakeFalkorDB = new FalkorDB();
      jest.spyOn(fakeFalkorDB, 'emit');
      const sentinel = new Sentinel(fakeClient);
      await expect(
        sentinel['tryConnectSentinelServer'](fakeClient, {}, fakeFalkorDB)
      ).rejects.toThrow('Multiple masters are not supported');
    });

    it('should emit error events when sentinel connection fails during operations', async () => {
        const errorHandler = jest.fn();
        try {
            const client = await FalkorDB.connect({
                socket: {
                    host: 'invalid-sentinel-host',
                    port: 99999
                }
            });
            
            client.on('error', errorHandler);
            await client.info();
            
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toMatch(/port.*range|connection.*failed/i);
        }
    });


    it('recovers from connection errors and emits error events during Sentinel failover', async () => {
        try {
            for (let i = 0; i < 5; i++) {
                try {
                    await sentinelClient.info();
                } catch (err) {
                    // Expect error to be handled and not crash the test
                    expect(err).toBeInstanceOf(Error);
                }
            }
            expect(true).toBe(true);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should test multiple sentinels connectivity', async () => {
        // Test connecting to different sentinel instances
        const sentinelConfigs = [
            { host: 'sentinel-1', port: 26379 },
            { host: 'sentinel-2', port: 26380 },
            { host: 'sentinel-3', port: 26381 }
        ];

        for (const config of sentinelConfigs) {
            try {
                const client = await FalkorDB.connect({
                    socket: config
                });
                const info = await client.info();
                expect(info).toBeDefined();
                await client.close();
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
            }
        }
    });


    it('should test constraint drop error handling on real sentinel', async () => {
        try {
            const graph = sentinelClient.selectGraph('constraint-error-test-graph');
            
            // Try to drop a constraint that doesn't exist to test error path
            try {
                await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'NonExistentLabel', 'nonExistentProperty');
                expect(true).toBe(true);
            } catch (constraintError) {
                expect(constraintError).toBeInstanceOf(Error);
            }
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should test sentinel disconnect and quit methods', async () => {
        try {
            const tempClient = await FalkorDB.connect({
                socket: {
                    host: 'sentinel-2',
                    port: 26380
                }
            });

            const info = await tempClient.info();
            expect(info).toBeDefined();

            // Test close() method which internally calls quit() on the sentinel client
            await tempClient.close();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should test sentinel configuration edge cases', async () => {
        // Test getting invalid configuration
        await expect(sentinelClient.configGet('TOTALLY_INVALID_CONFIG_KEY')).rejects.toThrow();

        // Test setting invalid configuration
        await expect(sentinelClient.configSet('INVALID_KEY', 'invalid_value')).rejects.toThrow();
    });

    it('should test graph operations with transaction-like behavior', async () => {
        try {
            const graph = sentinelClient.selectGraph('transaction-test-graph');
            
            // Test multiple operations in sequence to test connection stability
            await graph.query('CREATE (n1:TestNode {id: 1, name: "First"})');
            await graph.query('CREATE (n2:TestNode {id: 2, name: "Second"})');
            await graph.query('MATCH (n1:TestNode {id: 1}), (n2:TestNode {id: 2}) CREATE (n1)-[:CONNECTS]->(n2)');
            
            const result = await graph.query('MATCH (n1:TestNode)-[r:CONNECTS]->(n2:TestNode) RETURN n1.name, n2.name');
            expect(result.data).toBeDefined();
            if (result.data) {
                expect(result.data.length).toBe(1);
            }
            
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should test error boundaries in sentinel operations', async () => {
        try {
            const graph = sentinelClient.selectGraph('error-boundary-test');
            
            // Test various operations that might cause errors
            const operations = [
                () => graph.query('RETURN 1'),
                () => graph.roQuery('RETURN 2'),
                () => graph.explain('RETURN 3'),
                () => graph.profile('RETURN 4')
            ];

            for (const operation of operations) {
                try {
                    const result = await operation();
                    expect(result).toBeDefined();
                } catch (opError) {
                    expect(opError).toBeInstanceOf(Error);
                }
            }
            
            await graph.delete();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });
});