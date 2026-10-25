import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import { Temporal } from '@js-temporal/polyfill';
import FalkorDB from '../src/falkordb';
import * as QUERY from '../src/commands/QUERY';
import { SchemaVersionMismatchError } from '../src/errors';
import type { GraphEdge, GraphNode } from '../index';

const socket = {
    host: process.env.FALKORDB_HOST || 'localhost',
    port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
};

// 2^53 + 1, the smallest positive integer a number cannot hold
const BEYOND_SAFE = '9007199254740993';

describe('Integers in query results', () => {
    const graphName = `integers-${process.pid}-${Date.now()}`;
    let exact: FalkorDB;
    let rounded: FalkorDB;

    beforeAll(async () => {
        exact = await FalkorDB.connect({ socket, integers: 'bigint' });
        rounded = await FalkorDB.connect({ socket });
        await exact.selectGraph(graphName).query(
            `CREATE (:Item {big: ${BEYOND_SAFE}, small: 1, ratio: 0.5, name: 'a'})-[:LINK {weight: -${BEYOND_SAFE}}]->(:Item {big: 2})`
        );
    });

    afterAll(async () => {
        if (!exact) return;
        if ((await exact.list()).includes(graphName)) await exact.selectGraph(graphName).delete();
        await exact.close();
        await rounded?.close();
    });

    it('rounds integers beyond 2^53 by default', async () => {
        const result = await rounded.selectGraph(graphName).roQuery<{ n: number }>(`RETURN ${BEYOND_SAFE} AS n`);
        expect(result.data).toEqual([{ n: 9007199254740992 }]);
    });

    it("returns every integer exactly as a bigint with integers: 'bigint'", async () => {
        const graph = exact.selectGraph(graphName);
        for (const run of [graph.query.bind(graph), graph.roQuery.bind(graph)]) {
            const result = await run<{ big: bigint; neg: bigint; small: bigint; list: unknown; map: unknown }>(
                `RETURN ${BEYOND_SAFE} AS big, -${BEYOND_SAFE} AS neg, 1 AS small, [1, [${BEYOND_SAFE}]] AS list, {k: 2} AS map`
            );
            expect(result.data).toEqual([{
                big: BigInt(BEYOND_SAFE),
                neg: -BigInt(BEYOND_SAFE),
                small: 1n,
                list: [1n, [BigInt(BEYOND_SAFE)]],
                map: { k: 2n },
            }]);
        }
    });

    it('keeps node and edge ids, other values and statistics unchanged', async () => {
        type Row = { a: GraphNode; r: GraphEdge; b: GraphNode; d: Temporal.PlainDate };
        const { data, stats } = await exact.selectGraph(graphName).roQuery<Row>(
            "MATCH (a:Item)-[r]->(b) WHERE a.name = 'a' RETURN a, r, b, date('2020-01-02') AS d"
        );
        const [{ a, r, b, d }] = data!;

        expect(typeof a.id).toBe('number');
        expect(typeof r.id).toBe('number');
        expect(r.sourceId).toBe(a.id);
        expect(r.destinationId).toBe(b.id);
        expect(a.labels).toEqual(['Item']);
        expect(r.relationshipType).toBe('LINK');
        expect(a.properties).toEqual({ big: BigInt(BEYOND_SAFE), small: 1n, ratio: 0.5, name: 'a' });
        expect(r.properties).toEqual({ weight: -BigInt(BEYOND_SAFE) });
        expect(d.toString()).toBe('2020-01-02');
        expect(typeof stats.queryInternalExecutionTime).toBe('number');
    });

    it('sends a bigint parameter and reads it back exactly', async () => {
        const result = await exact.selectGraph(graphName).roQuery<{ v: bigint }>('RETURN $v AS v', {
            params: { v: BigInt(BEYOND_SAFE) },
        });
        expect(result.data).toEqual([{ v: BigInt(BEYOND_SAFE) }]);
    });

    it('rejects an unknown integers option', async () => {
        await expect(FalkorDB.connect({ socket, integers: 'string' as 'bigint' })).rejects.toThrow(
            new TypeError(`integers must be 'number' or 'bigint', not "string"`)
        );
    });

    it('reads a schema version reported as digits as a number', () => {
        expect(() => QUERY.transformReply([new Error('version mismatch'), '42'] as never))
            .toThrow(SchemaVersionMismatchError);
        try {
            QUERY.transformReply([new Error('version mismatch'), '42'] as never);
        } catch (err) {
            expect((err as SchemaVersionMismatchError).version).toBe(42);
        }
    });
});
