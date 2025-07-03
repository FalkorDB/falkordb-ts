import FalkorDB from '../src/falkordb';
import { ConstraintType, EntityType } from '../src/graph';
import { expect } from '@jest/globals';

function getRandomNumber(): number {
    return Math.floor(Math.random() * 999999);
}

describe('Cluster Client Tests', () => {
    let clusterClient: FalkorDB | null = null;
    const CLUSTER_HOST = 'localhost';
    const CLUSTER_PORT = 8000;

    beforeAll(async () => {
        try {
            clusterClient = await FalkorDB.connect({
                socket: {
                    host: CLUSTER_HOST,
                    port: CLUSTER_PORT,
                    connectTimeout: 5000
                }
            });
            await clusterClient.info();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Cluster tests require cluster node at ${CLUSTER_HOST}:${CLUSTER_PORT} - ${errorMsg}`);
        }
    }, 10000);

    afterAll(async () => {
        if (clusterClient) {
            await clusterClient.close();
        }
    });

    describe('Cluster Method Coverage', () => {
        it('should test query method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                const result = await graph.query('CREATE (:Person {id: 1})');
                expect(result).toBeDefined();
            } catch (err) {
                console.error('query method error:', err);
                throw err;
            }
        });
        it('should test roQuery method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                await graph.query('CREATE (:Person {id: 1})');
                const result = await graph.roQuery('MATCH (n) RETURN n');
                expect(result).toBeDefined();
            } catch (err) {
                console.error('roQuery method error:', err);
                throw err;
            }
        });
        it('should test delete method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                await graph.query('CREATE (:Person {id: 1})');
                const result = await graph.delete();
                expect(result).toBeUndefined();
            } catch (err) {
                console.error('delete method error:', err);
                throw err;
            }
        });
        it('should test list method', async () => {
            try {
                const result = await clusterClient!.list();
                expect(result).toBeDefined();
            } catch (err) {
                console.error('list method error:', err);
                throw err;
            }
        });
        it('should test explain method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                await graph.query('CREATE (:Person {id: 1})');
                const result = await graph.explain('MATCH (n) RETURN n');
                expect(result).toBeDefined();
            } catch (err) {
                console.error('explain method error:', err);
                throw err;
            }
        });
        it('should test profile method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                await graph.query('CREATE (:Person {id: 1})');
                const result = await graph.profile('MATCH (n) RETURN n');
                expect(result).toBeDefined();
            } catch (err) {
                console.error('profile method error:', err);
                throw err;
            }
        });
        it('should test configGet method', async () => {
            try {
                const result = await clusterClient!.configGet('RESULTSET_SIZE');
                expect(result).toBeDefined();
            } catch (err) {
                console.error('configGet method error:', err);
                throw err;
            }
        });
        it('should test configSet method', async () => {
            try {
                const result = await clusterClient!.configSet('RESULTSET_SIZE', 1000);
                expect(result).toBeUndefined();
            } catch (err) {
                console.error('configSet method error:', err);
                throw err;
            }
        });
        it('should test info method', async () => {
            try {
                const result = await clusterClient!.info();
                expect(result).toBeDefined();
            } catch (err) {
                console.error('info method error:', err);
                throw err;
            }
        });
        it('should test copy method', async () => {
            try {
                const tag = `{copytest${getRandomNumber()}}`;
                const srcGraph = `${tag}-src`;
                const destGraph = `${tag}-dest`;
                const graph = clusterClient!.selectGraph(srcGraph);
                await graph.query('CREATE (:Person {id: 1})');
                const result = await graph.copy(destGraph);
                expect(result).toBeDefined();
            } catch (err) {
                console.error('copy method error:', err);
                throw err;
            }
        });
        it('should test slowLog method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                await graph.query('CREATE (:Person {id: 1})');
                const result = await graph.slowLog();
                expect(result).toBeDefined();
            } catch (err) {
                console.error('slowLog method error:', err);
                throw err;
            }
        });
        it('should test constraintCreate method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`test-${getRandomNumber()}`);
                await graph.query('CREATE INDEX ON :Person(id)');
                const result = await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
                expect(result).toBeUndefined();
            } catch (err) {
                console.error('constraintCreate method error:', err);
                throw err;
            }
        });
        it('should test constraintDrop method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`test-${getRandomNumber()}`);
                await graph.query('CREATE (:Person {id: 1})');
                await graph.query('CREATE INDEX ON :Person(id)');
                await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
                const result = await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
                expect(result).toBeUndefined();
            } catch (err) {
                console.error('constraintDrop method error:', err);
                throw err;
            }
        });
    });

    describe('Cluster Feature Coverage', () => {
        it('should follow slot redirection for keys in different slots', async () => {
            const key1 = 'foo1';
            const key2 = 'foo2';
            const graph1 = clusterClient!.selectGraph(key1);
            const graph2 = clusterClient!.selectGraph(key2);
            const res1 = await graph1.query('RETURN 1');
            const res2 = await graph2.query('RETURN 2');
            expect(res1).toBeDefined();
            expect(res2).toBeDefined();
            await graph1.delete();
            await graph2.delete();
        });
    });
});