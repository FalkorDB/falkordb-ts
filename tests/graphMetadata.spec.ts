import { describe, it, expect } from '@jest/globals';
import Graph from '../src/graph';
import { Client } from '../src/clients/client';
import { SchemaVersionMismatchError } from '../src/errors';

// A reply to `RETURN n` holding one node with label id 0
const nodeReply = {
    headers: [[1, 'n']],
    data: [[[8, [0, [0], []]]]],
    metadata: [],
};

describe('Graph metadata cache', () => {
    it('should not cache metadata fetched while the graph was being deleted', async () => {
        let labels = 'Old';
        let releaseFetch!: () => void;
        const fetchHeld = new Promise<void>(resolve => (releaseFetch = resolve));
        let fetchStarted!: () => void;
        const fetchStart = new Promise<void>(resolve => (fetchStarted = resolve));
        let holdFetch = true;

        const client = {
            query: async () => nodeReply,
            roQuery: async (_graph: string, query: string) => {
                if (query !== 'CALL db.labels()') return { data: [] };
                const name = labels;
                if (holdFetch) {
                    fetchStarted();
                    await fetchHeld;
                }
                return { data: [[name]] };
            },
            delete: async () => 'OK',
        } as unknown as Client;

        const graph = new Graph(client, 'graph');

        // Start a metadata fetch and delete the graph before it completes
        const pending = graph.query<{ n: { labels: string[] } }>('MATCH (n) RETURN n');
        await fetchStart;
        await graph.delete();
        holdFetch = false;
        releaseFetch();

        // The in-flight reply predates the delete, so it keeps the old names
        expect((await pending).data?.[0].n.labels).toEqual(['Old']);

        // The recreated graph reuses label id 0 for a different label
        labels = 'New';
        const result = await graph.query<{ n: { labels: string[] } }>('MATCH (n) RETURN n');
        expect(result.data?.[0].n.labels).toEqual(['New']);
    });

    describe('schema version', () => {
        // Records the version sent with each query; rejects the next query
        // with a mismatch while `mismatch` is set
        function versionedClient() {
            const state = {
                sent: [] as Array<number | undefined>,
                mismatch: undefined as number | undefined,
                labels: 'Old',
                labelFetches: 0,
            };
            const run = async (version?: number) => {
                state.sent.push(version);
                if (state.mismatch !== undefined && version !== undefined) {
                    const current = state.mismatch;
                    state.mismatch = undefined;
                    throw new SchemaVersionMismatchError(current);
                }
                return nodeReply;
            };
            const client = {
                query: (_g: string, _q: string, _o: unknown, _c: boolean, version?: number) => run(version),
                roQuery: async (_g: string, query: string, _o: unknown, _c: boolean, version?: number) => {
                    if (query === 'CALL db.labels()') {
                        state.labelFetches++;
                        return { data: [[state.labels]] };
                    }
                    if (query.startsWith('CALL db.')) return { data: [] };
                    return run(version);
                },
                delete: async () => 'OK',
            } as unknown as Client;
            return { state, client };
        }

        it('should refresh metadata and retry once on a version mismatch', async () => {
            const { state, client } = versionedClient();
            const graph = new Graph(client, 'graph');

            expect((await graph.query<{ n: { labels: string[] } }>('MATCH (n) RETURN n')).data?.[0].n.labels).toEqual(['Old']);

            // Another client recreated the graph: label id 0 is now `New`
            state.labels = 'New';
            state.mismatch = 42;
            const result = await graph.query<{ n: { labels: string[] } }>('MATCH (n) RETURN n');

            expect(result.data?.[0].n.labels).toEqual(['New']);
            expect(state.labelFetches).toBe(2);
            // First query, then the rejected one and its retry without a version
            expect(state.sent).toEqual([0, 0, undefined]);

            await graph.query('RETURN 1');
            expect(state.sent[3]).toBe(42);
        });

        it('should refresh metadata and retry once on a version mismatch in roQuery', async () => {
            const { state, client } = versionedClient();
            const graph = new Graph(client, 'graph');

            await graph.roQuery('MATCH (n) RETURN n');
            state.labels = 'New';
            state.mismatch = 42;
            const result = await graph.roQuery<{ n: { labels: string[] } }>('MATCH (n) RETURN n');

            expect(result.data?.[0].n.labels).toEqual(['New']);
            // The retry is checked against the reported version
            expect(state.sent).toEqual([0, 0, 42]);

            await graph.roQuery('RETURN 1');
            expect(state.sent[3]).toBe(42);
        });

        it('should share the schema version between instances of the same graph', async () => {
            const { state, client } = versionedClient();
            const schema = { generation: 0, version: 0 };
            const first = new Graph(client, 'graph', { schema });
            const second = new Graph(client, 'graph', { schema });

            await second.query('MATCH (n) RETURN n');
            state.labels = 'New';
            state.mismatch = 42;
            await first.query('RETURN 1');

            const result = await second.query<{ n: { labels: string[] } }>('MATCH (n) RETURN n');
            expect(state.sent.at(-1)).toBe(42);
            expect(result.data?.[0].n.labels).toEqual(['New']);
        });

        it('should reset the schema version when the graph is deleted', async () => {
            const { state, client } = versionedClient();
            const graph = new Graph(client, 'graph');

            state.mismatch = 42;
            await graph.query('RETURN 1');
            await graph.delete();
            await graph.query('RETURN 1');

            expect(state.sent.at(-1)).toBe(0);
        });

        it('should not retry on other errors', async () => {
            let calls = 0;
            const client = {
                query: async () => {
                    calls++;
                    throw new Error('boom');
                },
            } as unknown as Client;

            await expect(new Graph(client, 'graph').query('RETURN 1')).rejects.toThrow('boom');
            expect(calls).toBe(1);
        });
    });

    it('should fetch metadata from the master, not a lagging replica', async () => {
        // A write created label id 0; the replica has not received it yet
        const client = {
            query: async () => nodeReply,
            roQuery: async (_g: string, query: string, _o: unknown, _c: boolean, _v?: number, primary?: boolean) => {
                if (query === 'CALL db.labels()') return { data: primary ? [['NewLabel']] : [] };
                return { data: [] };
            },
        } as unknown as Client;
        const graph = new Graph(client, 'graph');

        const result = await graph.query<{ n: { labels: string[] } }>('CREATE (n:NewLabel) RETURN n');

        expect(result.data?.[0].n.labels).toEqual(['NewLabel']);
    });

    describe('reads served by a replica that kept a recreated graph', () => {
        // The master deleted and recreated the graph: label id 0 is now `New`
        // there, while a lagging replica still holds the old graph, where it
        // is `Old`. Node ids tell which node's reply was decoded.
        function laggingReplicaClient(replicaVersion: number) {
            const nodes = {
                master: { version: 2, label: 'New', nodeId: 200 },
                // A replica at the master's version has caught up with it
                replica: { version: replicaVersion, label: replicaVersion === 2 ? 'New' : 'Old', nodeId: 100 },
            };
            const reads: Array<{ node: string; version?: number }> = [];
            const client = {
                roQuery: async (_g: string, query: string, _o: unknown, _c: boolean, version?: number, primary?: boolean) => {
                    const name = primary ? 'master' : 'replica';
                    const node = nodes[name];
                    if (version !== undefined && version !== node.version) {
                        throw new SchemaVersionMismatchError(node.version);
                    }
                    if (query === 'CALL db.labels()') return { data: [[node.label]] };
                    if (query.startsWith('CALL db.')) return { data: [] };
                    reads.push({ node: name, version });
                    return {
                        headers: [[1, 'n']],
                        data: [[[8, [node.nodeId, [0], []]]]],
                        metadata: [],
                    };
                },
            } as unknown as Client;
            return { client, reads, nodes };
        }

        type Row = { n: { id: number; labels: string[] } };

        it('should read from the master when the replica rejects the version', async () => {
            const { client, reads } = laggingReplicaClient(1);
            const graph = new Graph(client, 'graph', { schema: { generation: 0, version: 2 } });

            const result = await graph.roQuery<Row>('MATCH (n) RETURN n');

            expect(result.data?.[0].n).toMatchObject({ id: 200, labels: ['New'] });
            // The master rejected the replica's version and reported its own
            expect(reads).toEqual([{ node: 'master', version: 2 }]);
        });

        it('should read from the master when the names come from another schema', async () => {
            // The client still holds the old version, which the replica accepts
            const { client, reads } = laggingReplicaClient(1);
            const graph = new Graph(client, 'graph', { schema: { generation: 0, version: 1 } });

            const result = await graph.roQuery<Row>('MATCH (n) RETURN n');

            // Not the replica's node decoded with the master's names
            expect(result.data?.[0].n).toMatchObject({ id: 200, labels: ['New'] });
            expect(reads).toEqual([
                { node: 'replica', version: 1 },
                { node: 'master', version: 2 },
            ]);
        });

        it('should check the master read too when the schema changes meanwhile', async () => {
            const { client, reads, nodes } = laggingReplicaClient(1);
            const graph = new Graph(client, 'graph', { schema: { generation: 0, version: 2 } });
            // The master recreates the graph again once it has served a read
            const masterRead = client.roQuery;
            let recreated = false;
            client.roQuery = (async (...args: Parameters<Client['roQuery']>) => {
                const reply = await masterRead(...args);
                if (args[5] && !recreated && !args[1].toString().startsWith('CALL')) {
                    recreated = true;
                    Object.assign(nodes.master, { version: 3, label: 'Newer', nodeId: 300 });
                }
                return reply;
            }) as Client['roQuery'];

            const result = await graph.roQuery<Row>('MATCH (n) RETURN n');

            // The reply read under version 2 is not decoded with version 3's names
            expect(result.data?.[0].n).toMatchObject({ id: 300, labels: ['Newer'] });
            expect(reads).toEqual([
                { node: 'master', version: 2 },
                { node: 'master', version: 3 },
            ]);
        });

        it('should stop checking the version after repeated rejections', async () => {
            const { client, reads, nodes } = laggingReplicaClient(1);
            const graph = new Graph(client, 'graph', { schema: { generation: 0, version: 2 } });
            // Every rejection is followed by another schema change on the master
            const read = client.roQuery;
            client.roQuery = (async (...args: Parameters<Client['roQuery']>) => {
                try {
                    return await read(...args);
                } catch (err) {
                    nodes.master.version++;
                    throw err;
                }
            }) as Client['roQuery'];

            await graph.roQuery<Row>('MATCH (n) RETURN n');

            expect(reads).toEqual([{ node: 'master', version: undefined }]);
        });

        it('should decode a replica reply when its schema matches the master', async () => {
            const { client, reads } = laggingReplicaClient(2);
            const graph = new Graph(client, 'graph', { schema: { generation: 0, version: 2 } });

            const result = await graph.roQuery<Row>('MATCH (n) RETURN n');

            expect(result.data?.[0].n).toMatchObject({ id: 100, labels: ['New'] });
            expect(reads).toEqual([{ node: 'replica', version: 2 }]);
        });
    });
});
