import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { createClient } from 'redis';
import FalkorDB from '../src/falkordb';
import { ConstraintType, EntityType } from '../src/graph';

function getRandomNumber(): number {
    return Math.floor(Math.random() * 999999);
}

describe('Cluster Client Tests', () => {
    let clusterClient: FalkorDB | null = null;
    const CLUSTER_HOST = 'localhost';
    // A master: reads served by a replica can trail the write before them,
    // which the tests below don't wait for. Replicas are covered separately.
    const CLUSTER_PORT = 17000;

    beforeAll(async () => {
        try {
            clusterClient = await FalkorDB.connect({
                socket: {
                    host: CLUSTER_HOST,
                    port: CLUSTER_PORT,
                    connectTimeout: 10000
                }
            });
        } catch (error) {
            console.error('Error connecting to cluster:', error);
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
                // Writes the server default (unlimited): the setting is server-wide
                // and outlives the test, and a restore could land on another master.
                const result = await clusterClient!.configSet('RESULTSET_SIZE', -1);
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
        it("should test memoryUsage method", async () => {
          try {
            const graph = clusterClient!.selectGraph(
              `cluster-test-${getRandomNumber()}`
            );
            await graph.query("UNWIND range(1, 10) AS x CREATE (n:n)-[e:e]->(m:m)");
            const memoryProps = [
              "total_graph_sz_mb",
              "label_matrices_sz_mb",
              "relation_matrices_sz_mb",
              "amortized_node_block_sz_mb",
              "amortized_node_attributes_by_label_sz_mb",
              "amortized_unlabeled_nodes_attributes_sz_mb",
              "amortized_edge_block_sz_mb",
              "amortized_edge_attributes_by_type_sz_mb",
              "indices_sz_mb",
            ];
    
            const memoryList = await graph.memoryUsage();
    
            // Extract property names from even indices
            const returnedProps: string[] = [];
            for (let i = 0; i < memoryList.length; i += 2) {
              returnedProps.push(memoryList[i] as string);
            }
    
            // Check that all expected properties are present
            memoryProps.forEach((prop) => {
              expect(returnedProps).toContain(prop);
            });
    
            // Validate the structure: even indices are strings, odd indices are numbers or arrays
            for (let i = 0; i < memoryList.length; i++) {
              if (i % 2 === 0) {
                // Even index should be a string
                expect(typeof memoryList[i]).toBe("string");
              } else {
                // Odd index should be a number or array
                const value = memoryList[i];
                expect(
                  typeof value === "number" || Array.isArray(value)
                ).toBeTruthy();
              }
            }
    
            // Ensure the list has even length (key-value pairs)
            expect(memoryList.length % 2).toBe(0);
          } catch (err) {
            console.error("memoryUsage method error:", err);
            throw err;
          }
        });
        it('should test slowLog method', async () => {
            try {
                const graph = clusterClient!.selectGraph(`cluster-test-${getRandomNumber()}`);
                const longQuery = 'UNWIND range (0, 1000000) AS x RETURN max(x)';
                await graph.query(longQuery);
                const result = await graph.slowLog();
                expect(Array.isArray(result)).toBe(true);
                expect(result[0].command).toBe("GRAPH.QUERY");
                expect(result[0].query).toBe(longQuery);
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

describe('Cluster Client through a replica', () => {
    let replicaClient: FalkorDB | null = null;
    // node3 is a replica in the CI cluster (see docker/cluster-compose.yml)
    const REPLICA_PORT = 17003;

    // Reads may be served by a replica that has not caught up with the write
    // yet, so retry until the change has replicated.
    async function eventually<T>(read: () => Promise<T>, timeout = 5000): Promise<T> {
        const deadline = Date.now() + timeout;
        for (;;) {
            try {
                return await read();
            } catch (err) {
                if (Date.now() > deadline) throw err;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    beforeAll(async () => {
        replicaClient = await FalkorDB.connect({
            socket: { host: 'localhost', port: REPLICA_PORT, connectTimeout: 10000 }
        });
    }, 10000);

    afterAll(async () => {
        await replicaClient?.close();
    });

    it("returns integers exactly with integers: 'bigint', from replicas too", async () => {
        const reads = await replicaReads();
        let exact: FalkorDB | undefined;
        try {
            exact = await FalkorDB.connect({
                socket: { host: 'localhost', port: REPLICA_PORT, connectTimeout: 10000 },
                integers: 'bigint',
            });
            const graph = exact.selectGraph(`cluster-replica-test-${getRandomNumber()}`);
            const written = await graph.query<{ v: bigint }>('CREATE (n:Big {v: 9007199254740993}) RETURN n.v AS v');
            expect(written.data).toEqual([{ v: 9007199254740993n }]);

            // Retries only until the node serving the read has the data, so
            // that a reply decoded wrongly fails instead of being retried
            const read = () => eventually(async () => {
                const reply = await graph.roQuery<{ v: bigint }>('MATCH (n:Big) RETURN n.v AS v');
                if (!reply.data?.length) throw new Error('not replicated yet');
                return reply.data;
            });
            await read();

            const before = await reads.count();
            // Each read picks the master or its replica at random; every one
            // must decode exactly, and some must have come from a replica
            for (let i = 0; i < 20; i++) {
                expect(await read()).toEqual([{ v: 9007199254740993n }]);
            }
            expect(await reads.count()).toBeGreaterThan(before);
            await graph.delete();
        } finally {
            await exact?.close();
            reads.close();
        }
    }, 45000);

    it('writes through the masters and reads the replicated data', async () => {
        const graph = replicaClient!.selectGraph(`cluster-replica-test-${getRandomNumber()}`);
        await graph.query('CREATE (:Person {id: 1})');
        const result = await eventually(() => graph.roQuery<{ id: number }>('MATCH (n:Person) RETURN n.id AS id'));
        expect(result.data).toEqual([{ id: 1 }]);
        await graph.delete();
    });

    // Connects to every node once the cluster lists a replica for each shard,
    // and counts the GRAPH.RO_QUERY calls the replicas served. A replica only
    // answers reads after READONLY, so any count proves both.
    async function replicaReads() {
        const nodes = [17000, 17001, 17002, 17003, 17004, 17005].map(port =>
            createClient({ socket: { host: 'localhost', port, reconnectStrategy: false } }));
        const close = () => nodes.forEach(node => node.destroy());
        try {
            await Promise.all(nodes.map(node => node.connect()));
            // A new cluster reports itself ready before CLUSTER SLOTS lists the
            // replicas, and a client that connects then knows of no replicas to
            // read from. Wait for them, then connect.
            await eventually(async () => {
                const slots = await nodes[3].clusterSlots();
                if (slots.some(slot => slot.replicas.length === 0)) {
                    throw new Error('CLUSTER SLOTS does not list a replica for every shard yet');
                }
            }, 30000);

            const replicas = [];
            for (const node of nodes) {
                if ((await node.info('replication')).includes('role:slave')) replicas.push(node);
            }
            expect(replicas.length).toBeGreaterThan(0);
            const count = async () => {
                let calls = 0;
                for (const replica of replicas) {
                    const stats = /cmdstat_graph\.RO_QUERY:calls=(\d+)/i.exec(await replica.info('commandstats'));
                    calls += stats ? Number(stats[1]) : 0;
                }
                return calls;
            };
            // Safe on clients that failed to connect, unlike close()
            return { count, close };
        } catch (err) {
            close();
            throw err;
        }
    }

    it('serves reads from the replicas', async () => {
        const reads = await replicaReads();
        let client: FalkorDB | undefined;
        try {
            client = await FalkorDB.connect({ socket: { host: 'localhost', port: REPLICA_PORT } });

            const graph = client.selectGraph(`cluster-replica-test-${getRandomNumber()}`);
            await graph.query('CREATE (:Person {id: 1})');
            await eventually(() => graph.roQuery('MATCH (n) RETURN n'));

            const before = await reads.count();
            // Each read picks the master or its replica at random
            for (let i = 0; i < 20; i++) {
                await eventually(() => graph.roQuery('MATCH (n) RETURN n'));
            }
            expect(await reads.count()).toBeGreaterThan(before);
            await graph.delete();
        } finally {
            await client?.close();
            reads.close();
        }
    }, 45000);

    it('reads the slowlog from the master that ran the query', async () => {
        const graph = replicaClient!.selectGraph(`cluster-replica-test-${getRandomNumber()}`);
        const longQuery = 'UNWIND range (0, 1000000) AS x RETURN max(x)';
        try {
            await graph.query(longQuery);
            const result = await graph.slowLog();
            expect(result[0].query).toBe(longQuery);
        } finally {
            await graph.delete();
        }
    });

    it('profiles a write query', async () => {
        const graph = replicaClient!.selectGraph(`cluster-replica-test-${getRandomNumber()}`);
        const result = await graph.profile('CREATE (:Person {id: 1})');
        expect(result).toBeDefined();
        await graph.delete();
    });

    it('runs keyless writes on a master', async () => {
        // The server default (unlimited), so the write leaves the master unchanged
        await expect(replicaClient!.configSet('RESULTSET_SIZE', -1)).resolves.toBeUndefined();
    });
});
