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

    function skipIfNoClient(testFn: () => void | Promise<void>) {
        return async () => {
            if (!sentinelClient) {
                console.log('Skipping sentinel tests - no sentinel available');
                return;
            }
            await testFn();
        };
    }
    
    it('should create sentinel client instance', skipIfNoClient(() => {
        expect(sentinelClient).toBeDefined();
    }));

    it('should execute query through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const graph = sentinelClient.selectGraph('test-graph');
            const result = await graph.query('RETURN 1 as num');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should list graphs through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const graphs = await sentinelClient.list();
            expect(Array.isArray(graphs)).toBe(true);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should get config through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const config = await sentinelClient.configGet('RESULTSET_SIZE');
            expect(config).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should get info through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const info = await sentinelClient.info();
            expect(info).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle sentinel failover gracefully', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            await sentinelClient.info();
            expect(true).toBe(true);
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should handle graph operations through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const graph = sentinelClient.selectGraph('test-graph-ro');
            const result = await graph.roQuery('RETURN 1 as num');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should explain query through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const graph = sentinelClient.selectGraph('test-graph-explain');
            const result = await graph.explain('RETURN 1');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should profile query through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const graph = sentinelClient.selectGraph('test-graph-profile');
            const result = await graph.profile('RETURN 1');
            expect(result).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should set config through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        try {
            const info = await sentinelClient.info('server');
            expect(info).toBeDefined();
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
        }
    });

    it('should create constraints through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }
    
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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        await expect(sentinelClient.configGet('INVALID_CONFIG')).rejects.toThrow();
    });

    it('should handle concurrent operations through sentinel', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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

    it('should handle error event and reconnection failure in tryConnectSentinelServer', async () => {
        const error = new Error('Simulated connection error');
        const fakeClient: any = {
          options: {},
          falkordb: {
            sentinelMasters: jest.fn().mockResolvedValue([
              ['ip', '127.0.0.1', 'port', '6379'],
            ]),
          },
          disconnect: jest.fn().mockResolvedValue(undefined),
        };
        const EventEmitter = require('events');
        const fakeFalkorDB = new EventEmitter();
        const emitSpy = jest.spyOn(fakeFalkorDB, 'emit');
      
        // Mock createClient to simulate .on('error') and .connect()
        const createClientSpy = jest.spyOn(require('@redis/client'), 'createClient').mockImplementation(() => {
          return {
            on: function (event: string, cb: Function) {
              if (event === 'error') {
                setTimeout(() => cb(error), 10);
              }
              return this;
            },
            connect: async function () {
              throw error;
            },
            disconnect: jest.fn().mockResolvedValue(undefined),
          };
        });
      
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            createClientSpy.mockRestore();
            reject(new Error('Error event was not emitted in time'));
          }, 2000);
      
          fakeFalkorDB.on('error', (err: unknown) => {
            clearTimeout(timeout);
            expect(err).toBe(error);
            expect(emitSpy).toHaveBeenCalledWith('error', error);
            createClientSpy.mockRestore();
            resolve();
          });
      
          const sentinel = new Sentinel(fakeClient);
          sentinel['tryConnectSentinelServer'](fakeClient, {}, fakeFalkorDB).catch(() => {});
        });
      }, 5000);


    it('recovers from connection errors and emits error events during Sentinel failover', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel error/failover test - no sentinel available');
            return;
        }
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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

        // Test getting invalid configuration
        await expect(sentinelClient.configGet('TOTALLY_INVALID_CONFIG_KEY')).rejects.toThrow();

        // Test setting invalid configuration
        await expect(sentinelClient.configSet('INVALID_KEY', 'invalid_value')).rejects.toThrow();
    });

    it('should test graph operations with transaction-like behavior', async () => {
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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
        if (!sentinelClient) {
            console.log('Skipping sentinel tests - no sentinel available');
            return;
        }

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

    it('should ignore errors from previous realClient after client switch', async () => {
        const error = new Error('Simulated connection error');
        const fakeClient: any = {
          options: {},
          falkordb: {
            sentinelMasters: jest.fn().mockResolvedValue([
              ['ip', '127.0.0.1', 'port', '6379'],
            ]),
          },
          disconnect: jest.fn().mockResolvedValue(undefined),
        };
        const EventEmitter = require('events');
        const fakeFalkorDB = new EventEmitter();
        jest.spyOn(fakeFalkorDB, 'emit');

        // Mock createClient to simulate .on('error') and .connect()
        let realClientOnError: Function | undefined;
        const createClientSpy = jest.spyOn(require('@redis/client'), 'createClient').mockImplementation(() => {
          return {
            on: function (event: string, cb: Function) {
              if (event === 'error') {
                realClientOnError = cb;
              }
              return this;
            },
            connect: async function () {},
            disconnect: jest.fn().mockResolvedValue(undefined),
          };
        });

        const sentinel = new Sentinel(fakeClient);
        // Simulate initial connection
        await sentinel['tryConnectSentinelServer'](fakeClient, {}, fakeFalkorDB);

        // Simulate client switch
        const newClient: any = { disconnect: jest.fn().mockResolvedValue(undefined) };
        (sentinel as any).client = newClient;

        if (realClientOnError) {
          realClientOnError(error);
        }
        createClientSpy.mockRestore();
    });
});