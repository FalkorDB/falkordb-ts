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
            const client = {
                query: async (_g: string, _q: string, _o: unknown, _c: boolean, version?: number) => {
                    state.sent.push(version);
                    if (state.mismatch !== undefined && version !== undefined) {
                        const current = state.mismatch;
                        state.mismatch = undefined;
                        throw new SchemaVersionMismatchError(current);
                    }
                    return nodeReply;
                },
                roQuery: async (_graph: string, query: string) => {
                    if (query !== 'CALL db.labels()') return { data: [] };
                    state.labelFetches++;
                    return { data: [[state.labels]] };
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
});
