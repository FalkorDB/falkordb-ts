import { describe, it, beforeAll, afterAll, afterEach, expect, jest } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import Graph from '../src/graph';
import { Single } from '../src/clients/single';
import { client } from './dbConnection';
import type { QueryReply } from '../src/types';

// What tests/globalSetup.ts found the server under test to do
const SCHEMA_HASH = process.env.FALKORDB_SCHEMA_HASH === 'supported';
const HASHED_VERSION = process.env.FALKORDB_SCHEMA_VERSION === 'hash';

// The queries the client fetches a graph's names with on older servers
const METADATA_QUERIES = ['CALL db.labels()', 'CALL db.relationshipTypes()', 'CALL db.propertyKeys()'];

type Row = { n: { labels: string[]; properties: Record<string, unknown> } };

const graphName = (name: string) => `schema-hash-${name}-${Math.floor(Math.random() * 999999)}`;

describe('SCHEMA_HASH against the server', () => {
    let db: FalkorDB;
    let other: FalkorDB;
    const graphs: Graph[] = [];

    beforeAll(async () => {
        db = await client();
        other = await client();
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await Promise.all(graphs.splice(0).map((graph) => graph.delete().catch(() => {})));
    });

    afterAll(async () => {
        await db?.close();
        await other?.close();
    });

    const select = (instance: FalkorDB, name: string) => {
        const graph = instance.selectGraph(name);
        graphs.push(graph);
        return graph;
    };

    // Counts what the client sends: metadata fetches, and the queries whose
    // replies carried names
    function spy() {
        const roQuery = jest.spyOn(Single.prototype, 'roQuery');
        const query = jest.spyOn(Single.prototype, 'query');
        const fetches = () =>
            roQuery.mock.calls.filter(([, q]) => METADATA_QUERIES.includes(String(q))).length;
        // Queries first, then reads, leaving out metadata fetches and the
        // queries a stale version rejected
        const replies = async () => {
            const settled = await Promise.allSettled(
                [...query.mock.results, ...roQuery.mock.results].map(
                    (result) => result.value as Promise<QueryReply>
                )
            );
            return settled.flatMap((result) =>
                result.status === 'fulfilled' && result.value.headers ? [result.value] : []
            );
        };
        return { fetches, replies };
    }

    /**
     * The first client caches the names of `(:Person {name})`; a second one
     * deletes the graph and recreates it as `(:Movie {title})`, with as many
     * schema changes, so the schema version (a counter on 6.x) is unchanged.
     */
    async function readAfterExternalRecreate(instance: FalkorDB, ro: boolean) {
        const name = graphName('recreate');
        const graph = select(instance, name);
        await graph.query("CREATE (:Person {name: 'Alice'})");
        await graph.query('MATCH (n) RETURN n');

        const theirs = select(other, name);
        await theirs.delete();
        await theirs.query("CREATE (:Movie {title: 'Heat'})");

        const reply = ro
            ? await graph.roQuery<Row>('MATCH (n) RETURN n')
            : await graph.query<Row>('MATCH (n) RETURN n');
        return reply.data![0].n;
    }

    describe.each([false, true])('after another client recreates the graph (roQuery: %s)', (ro) => {
        it('decodes the new names', async () => {
            const node = await readAfterExternalRecreate(db, ro);
            if (SCHEMA_HASH || HASHED_VERSION) {
                expect(node).toEqual({ id: 0, labels: ['Movie'], properties: { title: 'Heat' } });
            } else {
                // FalkorDB 6.0.x: neither SCHEMA_HASH nor a version that
                // notices a recreate with as many schema changes. A read still
                // refetches the names, since those a write cached carry no
                // version; a write decodes with the stale ones.
                expect(node.labels).toEqual(ro ? ['Movie'] : ['Person']);
            }
        });
    });

    // Through query(): names cached by a write carry no version, so roQuery()
    // refetches them whatever the option says
    it('decodes with stale names when SCHEMA_HASH is turned off, unless the version is a hash', async () => {
        const off = await FalkorDB.connect({
            host: process.env.FALKORDB_HOST || 'localhost',
            port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
            schemaHash: false,
        });
        try {
            const node = await readAfterExternalRecreate(off, false);
            // The off switch really turns the feature off
            expect(node.labels).toEqual(HASHED_VERSION ? ['Movie'] : ['Person']);
        } finally {
            await off.close();
        }
    });

    it('decodes a graph recreated with the same names in the same order', async () => {
        const name = graphName('same');
        const graph = select(db, name);
        await graph.query("CREATE (:Person {name: 'Alice'})");
        await graph.query('MATCH (n) RETURN n');

        const theirs = select(other, name);
        await theirs.delete();
        await theirs.query("CREATE (:Person {name: 'Bob'})");

        const reply = await graph.query<Row>('MATCH (n) RETURN n');
        expect(reply.data![0].n).toMatchObject({ labels: ['Person'], properties: { name: 'Bob' } });
    });

    it('decodes names a write adds on the first try, then reads by hash alone', async () => {
        const graph = select(db, graphName('write'));
        await graph.query("CREATE (:A {a: 1})");
        await graph.query('MATCH (n) RETURN n');

        const { fetches, replies } = spy();
        const created = await graph.query<{ b: Row['n']; r: { relationshipType: string; properties: Record<string, unknown> } }>(
            "MATCH (a:A) CREATE (a)-[r:R {w: 2}]->(b:B {b: 'x'}) RETURN b, r"
        );
        expect(created.data![0].b).toMatchObject({ labels: ['B'], properties: { b: 'x' } });
        expect(created.data![0].r).toMatchObject({ relationshipType: 'R', properties: { w: 2 } });

        const read = await graph.roQuery<Row>('MATCH (n:B) RETURN n');
        expect(read.data![0].n.labels).toEqual(['B']);

        const [write, again] = await replies();
        if (SCHEMA_HASH) {
            expect(fetches()).toBe(0);
            const names = write.schema!.names!;
            expect(names.labels).toEqual(['A', 'B']);
            expect(names.relationshipTypes).toEqual(['R']);
            expect([...names.propertyKeys].sort()).toEqual(['a', 'b', 'w']);
            expect(again.schema).toEqual({ hash: write.schema!.hash });
        } else {
            expect(fetches()).toBeGreaterThan(0);
            expect(write.schema).toBeUndefined();
        }
    });

    it('reads a write with no RETURN as statistics only', async () => {
        const graph = select(db, graphName('stats'));
        const reply = await graph.query('CREATE (:X {p: 1})');
        expect(reply.data).toBeUndefined();
        expect(reply.stats.nodesCreated).toBe(1);
        expect(reply.stats.labelsAdded).toBe(1);
    });

    it('decodes concurrent queries while names are being added', async () => {
        const graph = select(db, graphName('concurrent'));
        await graph.query('CREATE (:L0 {p0: 0})');

        const writes = Array.from({ length: 10 }, (_, i) =>
            graph.query<Row>(`CREATE (n:L${i + 1} {p${i + 1}: ${i + 1}}) RETURN n`)
        );
        const reads = Array.from({ length: 10 }, () =>
            graph.roQuery<Row>('MATCH (n:L0) RETURN n')
        );
        const written = await Promise.all(writes);
        written.forEach((reply, i) =>
            expect(reply.data![0].n).toMatchObject({ labels: [`L${i + 1}`], properties: { [`p${i + 1}`]: i + 1 } })
        );
        for (const reply of await Promise.all(reads)) {
            expect(reply.data![0].n).toMatchObject({ labels: ['L0'], properties: { p0: 0 } });
        }

        // The cache ends at the newest schema
        const all = await graph.roQuery<Row>('MATCH (n) RETURN n ORDER BY id(n)');
        expect(all.data!.map((row) => row.n.labels[0])).toEqual(
            Array.from({ length: 11 }, (_, i) => `L${i}`)
        );
    });

    it('decodes nodes a procedure returns', async () => {
        const graph = select(db, graphName('procedure'));
        await graph.query("CREATE (:Movie {title: 'Heat'})");
        await graph.createNodeFulltextIndex('Movie', 'title');

        const { fetches } = spy();
        const reply = await graph.callProcedure<{ node: Row['n'] }>(
            'db.idx.fulltext.queryNodes', ['Movie', 'Heat'], { yields: ['node'] }
        );
        expect(reply.data![0].node).toMatchObject({ labels: ['Movie'], properties: { title: 'Heat' } });
        if (SCHEMA_HASH) expect(fetches()).toBe(0);
    });

    it('returns integers as numbers or bigints, as asked', async () => {
        const graph = select(db, graphName('integers'));
        const big = await FalkorDB.connect({
            host: process.env.FALKORDB_HOST || 'localhost',
            port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
            integers: 'bigint',
        });
        try {
            await graph.query('CREATE (:N {v: 9007199254740993})');
            const asNumber = await graph.query<{ v: unknown }>('MATCH (n:N) RETURN n.v AS v');
            expect(asNumber.data![0].v).toBe(9007199254740992);
            const asBigint = await big.selectGraph(graph.name).query<{ v: unknown }>('MATCH (n:N) RETURN n.v AS v');
            expect(asBigint.data![0].v).toBe(9007199254740993n);
        } finally {
            await big.close();
        }
    });
});
