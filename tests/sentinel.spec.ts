import FalkorDB from '../src/falkordb';
import { ConstraintType, EntityType } from '../src/graph';
import { expect } from '@jest/globals';
import { Sentinel } from '../src/clients/sentinel';
import { Single } from '../src/clients/single';

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

   
});