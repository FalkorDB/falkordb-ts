import { describe, it, expect } from '@jest/globals';
import Graph from '../src/graph';
import { Client } from '../src/clients/client';

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
});
