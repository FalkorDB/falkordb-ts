import { describe, it, expect, jest } from '@jest/globals';
import Graph, { GraphSchemaState } from '../src/graph';
import { Client } from '../src/clients/client';
import * as QUERY from '../src/commands/QUERY';
import * as RO_QUERY from '../src/commands/RO_QUERY';
import { parseSchemaElement } from '../src/commands/QUERY';
import { SchemaVersionMismatchError } from '../src/errors';
import type { GraphMetadata, QueryOptions } from '../src/types';

// The example hash in FalkorDB/FalkorDB#3846, beyond Number.MAX_SAFE_INTEGER
const BIG_HASH = '-1146456808972410223';

const STATS = ['Cached execution: 0', 'Query internal execution time: 0.1 milliseconds'];

const names = (
    labels: string[],
    propertyKeys: string[] = [],
    relationshipTypes: string[] = []
): GraphMetadata => ({ labels, relationshipTypes, propertyKeys });

describe('SCHEMA_HASH', () => {
    describe('parseSchemaElement', () => {
        it('reads a hash alone', () => {
            expect(parseSchemaElement(['hash', BIG_HASH])).toEqual({ hash: BIG_HASH });
        });

        it('reads a hash with its names, including empty lists', () => {
            expect(parseSchemaElement([
                'hash', '42',
                'labels', ['Person', 'City'],
                'relationshipTypes', [],
                'propertyKeys', ['name'],
            ])).toEqual({ hash: '42', names: names(['Person', 'City'], ['name']) });
        });

        it('reads keys by name, in any order, and ignores unknown ones', () => {
            expect(parseSchemaElement([
                'hash', '7',
                'propertyKeys', ['age'],
                'future', 'whatever',
                'labels', ['L'],
                'relationshipTypes', ['R'],
            ])).toEqual({ hash: '7', names: names(['L'], ['age'], ['R']) });
        });

        it('keeps the exact digits of a 64-bit hash', () => {
            expect(parseSchemaElement(['hash', BIG_HASH])?.hash).toBe(BIG_HASH);
            expect(parseSchemaElement(['hash', '17300287264737141393'])?.hash).toBe('17300287264737141393');
            // Read without exact integers it is a number: kept as its digits,
            // rounded, which costs a resend of the names but never wrong names
            expect(parseSchemaElement(['hash', 5])?.hash).toBe('5');
            expect(parseSchemaElement(['hash', BigInt(BIG_HASH)])?.hash).toBe(BIG_HASH);
        });

        it('rejects a malformed hash', () => {
            expect(() => parseSchemaElement(['hash', 'abc'])).toThrow(/Invalid schema hash/);
            expect(() => parseSchemaElement(['hash', 1.5])).toThrow(/Invalid schema hash/);
            expect(() => parseSchemaElement(['hash', null])).toThrow(/Invalid schema hash/);
        });

        it('rejects lists that are not lists of names', () => {
            expect(() => parseSchemaElement([
                'hash', '1', 'labels', 'Person', 'relationshipTypes', [], 'propertyKeys', [],
            ])).toThrow(/labels is not a list of names/);
            expect(() => parseSchemaElement([
                'hash', '1', 'labels', [], 'relationshipTypes', [], 'propertyKeys', [3],
            ])).toThrow(/propertyKeys is not a list of names/);
        });

        it('rejects names with a list missing', () => {
            expect(() => parseSchemaElement(['hash', '1', 'labels', []])).toThrow(/relationshipTypes, propertyKeys missing/);
        });

        it('is not fooled by anything else', () => {
            expect(parseSchemaElement(STATS)).toBeUndefined();
            expect(parseSchemaElement([])).toBeUndefined();
            expect(parseSchemaElement(['hash'])).toBeUndefined();
            expect(parseSchemaElement(['hash', '1', 'labels'])).toBeUndefined();
            expect(parseSchemaElement('hash')).toBeUndefined();
        });
    });

    describe('transformReply', () => {
        const header = [[1, 'n']];
        const rows = [[[3, 1]]];

        it('reads a reply without the element as before', () => {
            expect(QUERY.transformReply([STATS] as any)).toEqual({
                headers: undefined, data: undefined, metadata: STATS,
            });
            expect(QUERY.transformReply([header, rows, STATS] as any)).toEqual({
                headers: header, data: rows, metadata: STATS,
            });
        });

        it('reads [stats, schema] as a reply with no rows', () => {
            expect(QUERY.transformReply([STATS, ['hash', '9']] as any)).toEqual({
                headers: undefined, data: undefined, metadata: STATS, schema: { hash: '9' },
            });
        });

        it('reads [header, rows, stats, schema]', () => {
            const reply = QUERY.transformReply([
                header, rows, STATS,
                ['hash', BIG_HASH, 'labels', ['L'], 'relationshipTypes', [], 'propertyKeys', []],
            ] as any);
            expect(reply).toEqual({
                headers: header, data: rows, metadata: STATS,
                schema: { hash: BIG_HASH, names: names(['L']) },
            });
        });

        it('still turns a stale version into SchemaVersionMismatchError', () => {
            expect(() => QUERY.transformReply([new Error('ERR invalid graph version'), 3] as any))
                .toThrow(SchemaVersionMismatchError);
        });
    });

    describe('arguments', () => {
        it('sends SCHEMA_HASH last, after --compact', () => {
            expect(QUERY.transformArguments('g', 'RETURN 1', { TIMEOUT: 5 }, true, undefined, BIG_HASH))
                .toEqual(['GRAPH.QUERY', 'g', 'RETURN 1', 'TIMEOUT', '5', '--compact', 'SCHEMA_HASH', BIG_HASH]);
            expect(RO_QUERY.transformArguments('g', 'RETURN 1', undefined, true, 3, '0'))
                .toEqual(['GRAPH.RO_QUERY', 'g', 'RETURN 1', 'version', '3', '--compact', 'SCHEMA_HASH', '0']);
        });

        it('sends no SCHEMA_HASH unless given one', () => {
            expect(QUERY.transformArguments('g', 'RETURN 1', undefined, true, 3))
                .toEqual(['GRAPH.QUERY', 'g', 'RETURN 1', 'version', '3', '--compact']);
        });

        it('refuses SCHEMA_HASH without --compact, which the server requires', () => {
            expect(() => QUERY.transformArguments('g', 'RETURN 1', undefined, false, undefined, '0'))
                .toThrow(/compact/);
        });
    });

    describe('Graph', () => {
        type Sent = { command: string[]; version?: number; hash?: string; primary?: boolean; exact?: boolean };
        type Row = { n: { id: number; labels: string[]; properties: Record<string, unknown> } };

        /**
         * A server holding one graph with one node, with label id 0 and
         * property id 0 set to `value`. With `supportsHash` it answers
         * SCHEMA_HASH as FalkorDB 6.2 does; without, it ignores it, as older
         * servers do. Its schema version is a counter that only moves when
         * told to, as on the Rust engine.
         */
        function server(schema: GraphMetadata, { supportsHash = true } = {}) {
            const hashes = new Map<string, string>();
            const hashOf = (n: GraphMetadata) => {
                const key = JSON.stringify(n);
                if (key === JSON.stringify(names([]))) return '0';
                if (!hashes.has(key)) hashes.set(key, (BigInt(BIG_HASH) + BigInt(hashes.size)).toString());
                return hashes.get(key)!;
            };
            const state = {
                schema,
                supportsHash,
                version: 0,
                // The type and value of the node's one property
                valueType: 2,
                value: 'v' as unknown,
                sent: [] as Sent[],
                fetches: 0,
                // Holds the next reply until released, to interleave queries
                hold: undefined as Promise<void> | undefined,
                hashOf,
            };

            const run = async (
                command: string,
                query: string,
                options: QueryOptions | undefined,
                version?: number,
                exact?: boolean,
                hash?: string,
                primary?: boolean
            ) => {
                if (query.startsWith('CALL db.')) {
                    state.fetches++;
                    const key = query === 'CALL db.labels()' ? 'labels'
                        : query === 'CALL db.propertyKeys()' ? 'propertyKeys' : 'relationshipTypes';
                    return { data: state.schema[key].map((name) => [name]) };
                }
                const args = command === 'GRAPH.QUERY'
                    ? QUERY.transformArguments('g', query, options, true, version, hash)
                    : RO_QUERY.transformArguments('g', query, options, true, version, hash);
                state.sent.push({ command: args.map(String), version, hash, primary, exact });
                // Read before the hold, as the server reads the schema when it
                // runs the query
                const current = state.schema;
                if (state.hold) {
                    const hold = state.hold;
                    state.hold = undefined;
                    await hold;
                }
                if (version !== undefined && version !== state.version) {
                    throw new SchemaVersionMismatchError(state.version);
                }
                const raw: unknown[] = query.startsWith('CREATE')
                    ? [STATS]
                    : [[[1, 'n']], [[[8, [0, [0], [[0, state.valueType, state.value]]]]]], STATS];
                if (state.supportsHash && hash !== undefined) {
                    const h = hashOf(current);
                    raw.push(h === hash ? ['hash', h] : [
                        'hash', h,
                        'labels', current.labels,
                        'relationshipTypes', current.relationshipTypes,
                        'propertyKeys', current.propertyKeys,
                    ]);
                }
                return QUERY.transformReply(raw as any);
            };

            const client = {
                query: (_g: string, q: string, o: QueryOptions, _c: boolean, version?: number, exact?: boolean, hash?: string) =>
                    run('GRAPH.QUERY', q, o, version, exact, hash),
                roQuery: (_g: string, q: string, o: QueryOptions, _c: boolean, version?: number, primary?: boolean, exact?: boolean, hash?: string) =>
                    run('GRAPH.RO_QUERY', q, o, version, exact, hash, primary),
                delete: async () => 'OK',
            } as unknown as Client;
            return { state, client };
        }

        const read = async (graph: Graph, ro = false) => {
            const reply = ro
                ? await graph.roQuery<Row>('MATCH (n) RETURN n')
                : await graph.query<Row>('MATCH (n) RETURN n');
            const { labels, properties } = reply.data![0].n;
            return { labels, properties };
        };

        it('decodes with the names a reply carries, then sends their hash alone', async () => {
            const { state, client } = server(names(['Person'], ['name']));
            const graph = new Graph(client, 'g');

            expect(await read(graph)).toEqual({ labels: ['Person'], properties: { name: 'v' } });
            // Unknown support yet: today's version, plus SCHEMA_HASH 0
            expect(state.sent[0]).toMatchObject({ version: 0, hash: '0' });

            expect(await read(graph, true)).toEqual({ labels: ['Person'], properties: { name: 'v' } });
            expect(state.sent.at(-1)).toMatchObject({ version: undefined, hash: state.hashOf(state.schema) });
            expect(state.fetches).toBe(0);
        });

        it('decodes with new names after another client recreates the graph', async () => {
            const { state, client } = server(names(['Person'], ['name']));
            const graph = new Graph(client, 'g');
            await read(graph);

            // Recreated with as many schema changes: the counter is unchanged
            state.schema = names(['Movie'], ['title']);
            expect(await read(graph)).toEqual({ labels: ['Movie'], properties: { title: 'v' } });
            expect(await read(graph, true)).toEqual({ labels: ['Movie'], properties: { title: 'v' } });
            expect(state.sent.at(-1)?.hash).toBe(state.hashOf(state.schema));
            expect(state.fetches).toBe(0);
        });

        it('decodes a reply with the names its request was sent with, whatever the cache holds by then', async () => {
            const { state, client } = server(names(['Person'], ['name']));
            const graph = new Graph(client, 'g');
            await read(graph);

            // The first read is held after the server ran it on the old
            // schema; the graph is recreated and a second read caches the new
            // names before the first one's hash-only reply arrives
            let release!: () => void;
            state.hold = new Promise<void>((resolve) => (release = resolve));
            const first = read(graph);
            state.schema = names(['Movie'], ['title']);
            expect(await read(graph)).toEqual({ labels: ['Movie'], properties: { title: 'v' } });
            release();
            expect(await first).toEqual({ labels: ['Person'], properties: { name: 'v' } });
            // The newer names stay cached
            await read(graph);
            expect(state.sent.at(-1)?.hash).toBe(state.hashOf(names(['Movie'], ['title'])));
        });

        it('does not let a reply to a query sent with an older hash replace the cache', async () => {
            const { state, client } = server(names(['A'], ['p']));
            const graph = new Graph(client, 'g');
            await read(graph);

            // Two reads sent with the same hash: the first is held after the
            // server ran it on schema B, the second runs on schema C and
            // updates the cache first
            state.schema = names(['B'], ['q']);
            let release!: () => void;
            state.hold = new Promise<void>((resolve) => (release = resolve));
            const crossed = read(graph, true);
            state.schema = names(['C'], ['r']);
            expect(await read(graph, true)).toEqual({ labels: ['C'], properties: { r: 'v' } });
            release();
            expect(await crossed).toEqual({ labels: ['B'], properties: { q: 'v' } });

            await read(graph);
            expect(state.sent.at(-1)?.hash).toBe(state.hashOf(names(['C'], ['r'])));
        });

        it.each([
            ['the graph grew', names(['A'], ['p']), names(['A', 'B'], ['p', 'q'])],
            ['the graph was recreated', names(['A', 'B'], ['p']), names(['B', 'A'], ['p'])],
            // The new names are a prefix of the cached ones, as a replica that
            // is behind would send
            ['the graph was recreated with fewer names', names(['A', 'B'], ['p', 'q']), names(['A'], ['p'])],
        ])('replaces the cached names when %s', async (_case, before, after) => {
            const { state, client } = server(before);
            const graph = new Graph(client, 'g');
            await read(graph);
            state.schema = after;
            await read(graph);
            await read(graph);
            expect(state.sent.at(-1)?.hash).toBe(state.hashOf(after));
        });

        it('decodes an empty schema, whose hash is 0, without names', async () => {
            const { state, client } = server(names([]));
            const graph = new Graph(client, 'g');
            const reply = await graph.query('CREATE ()');
            expect(reply.data).toBeUndefined();
            expect(reply.stats).toBeDefined();
            // The server confirmed hash 0, so it is sent again
            await graph.query('CREATE ()');
            expect(state.sent.at(-1)).toMatchObject({ version: undefined, hash: '0' });
        });

        it('reads the stats of a write with no rows, and caches the names it brings', async () => {
            const { state, client } = server(names(['A'], ['p']));
            const graph = new Graph(client, 'g');
            const reply = await graph.query('CREATE (:A {p: 1})');
            expect(reply.data).toBeUndefined();
            expect(reply.stats).toMatchObject({ cachedExecution: false });
            await read(graph);
            expect(state.sent.at(-1)?.hash).toBe(state.hashOf(state.schema));
        });

        it('throws on an id missing from names the server vouched for, without fetching', async () => {
            const { state, client } = server(names([], ['p']));
            const graph = new Graph(client, 'g');
            await expect(read(graph)).rejects.toThrow('Cannot find value from labels[0]');
            expect(state.fetches).toBe(0);
        });

        it('throws on a reply whose hash differs from the one sent but carries no names', async () => {
            const client = {
                query: async () => QUERY.transformReply([STATS, ['hash', '5']] as any),
            } as unknown as Client;
            await expect(new Graph(client, 'g').query('CREATE ()')).rejects.toThrow(
                'Schema hash 5 in reply does not match the hash sent, and carries no names'
            );
        });

        it('never sends more than 8 arguments', async () => {
            const timeouts: Array<QueryOptions | undefined> = [undefined, { TIMEOUT: 100 }, { TIMEOUT: 100, params: { a: 1 } }];
            for (const supportsHash of [true, false]) {
                for (const options of timeouts) {
                    const { state, client } = server(names(['A'], ['p']), { supportsHash });
                    const graph = new Graph(client, 'g');
                    // Unknown support, the retry after a mismatch, then known
                    await graph.query('MATCH (n) RETURN n', options);
                    await graph.roQuery('MATCH (n) RETURN n', options);
                    await graph.query('MATCH (n) RETURN n', options);
                    for (const { command } of state.sent) {
                        expect(command.length).toBeLessThanOrEqual(8);
                    }
                }
            }
        });

        it('keeps SCHEMA_HASH over version while support is unknown and both do not fit', async () => {
            const { state, client } = server(names(['A'], ['p']));
            const graph = new Graph(client, 'g');
            await graph.query('MATCH (n) RETURN n', { TIMEOUT: 100 });
            expect(state.sent[0]).toMatchObject({ version: undefined, hash: '0' });
        });

        describe('on a server without SCHEMA_HASH', () => {
            it('keeps the version check, and adds SCHEMA_HASH 0 only where it fits', async () => {
                const { state, client } = server(names(['A'], ['p']), { supportsHash: false });
                state.version = 1;
                const graph = new Graph(client, 'g');
                expect(await read(graph)).toEqual({ labels: ['A'], properties: { p: 'v' } });
                // Rejected for version 0, retried without one
                expect(state.sent.map(({ version, hash }) => ({ version, hash }))).toEqual([
                    { version: 0, hash: '0' },
                    { version: undefined, hash: '0' },
                ]);

                await graph.query('MATCH (n) RETURN n', { TIMEOUT: 100 });
                expect(state.sent.at(-1)).toMatchObject({ version: 1, hash: undefined });
                await read(graph);
                expect(state.sent.at(-1)).toMatchObject({ version: 1, hash: '0' });
                expect(state.fetches).toBe(3);
            });

            it('switches to the hash once the server is upgraded', async () => {
                const { state, client } = server(names(['A'], ['p']), { supportsHash: false });
                const graph = new Graph(client, 'g');
                await read(graph);
                state.supportsHash = true;
                state.schema = names(['B'], ['q']);
                expect(await read(graph)).toEqual({ labels: ['B'], properties: { q: 'v' } });
                await read(graph);
                expect(state.sent.at(-1)).toMatchObject({ version: undefined, hash: state.hashOf(state.schema) });
            });

            it('refetches the names when the server stops answering SCHEMA_HASH', async () => {
                const { state, client } = server(names(['A'], ['p']));
                    const graph = new Graph(client, 'g');
                await read(graph);

                // A failover to an older server that recreated the graph: the
                // reply was checked by nothing, so cached names are not trusted
                state.supportsHash = false;
                state.schema = names(['B'], ['q']);
                expect(await read(graph)).toEqual({ labels: ['B'], properties: { q: 'v' } });
                expect(state.fetches).toBe(3);
                await read(graph);
                expect(state.sent.at(-1)).toMatchObject({ version: 0, hash: '0' });
            });

            it('decodes every hash-only reply the older server sent with names fetched afresh', async () => {
                const { state, client } = server(names(['A'], ['p']));
                const graph = new Graph(client, 'g');
                await read(graph);

                // Two reads in flight when the server stops answering
                // SCHEMA_HASH; the second finishes first and fetches names,
                // then the graph is recreated before the first reply arrives
                state.supportsHash = false;
                let release!: () => void;
                state.hold = new Promise<void>((resolve) => (release = resolve));
                const first = read(graph, true);
                expect(await read(graph, true)).toEqual({ labels: ['A'], properties: { p: 'v' } });
                state.schema = names(['B'], ['q']);
                release();
                expect(await first).toEqual({ labels: ['B'], properties: { q: 'v' } });
            });

            it('asks again now and then whether the server supports SCHEMA_HASH when it cannot send it with version', async () => {
                let now = 1_000_000;
                jest.spyOn(Date, 'now').mockImplementation(() => now);
                const { state, client } = server(names(['A'], ['p']), { supportsHash: false });
                const graph = new Graph(client, 'g');
                const timed = () => graph.query<Row>('MATCH (n) RETURN n', { TIMEOUT: 100 });
                const sent = () => {
                    const { version, hash } = state.sent.at(-1)!;
                    return { version, hash };
                };

                await timed();
                await timed();
                expect(sent()).toEqual({ version: 0, hash: undefined });

                // A minute on: one probe, decoded with names fetched afresh
                now += 60_000;
                const fetches = state.fetches;
                state.schema = names(['B'], ['q']);
                expect((await timed()).data![0].n.labels).toEqual(['B']);
                expect(sent()).toEqual({ version: undefined, hash: '0' });
                expect(state.fetches).toBe(fetches + 3);
                await timed();
                expect(sent()).toEqual({ version: 0, hash: undefined });

                // Upgraded meanwhile: the next probe finds it out
                state.supportsHash = true;
                now += 60_000;
                await timed();
                await timed();
                expect(sent()).toEqual({ version: undefined, hash: state.hashOf(state.schema) });
                jest.restoreAllMocks();
            });
        });

        it('shares the cached names between instances for the same graph', async () => {
            const { state, client } = server(names(['A'], ['p']));
            const schema: GraphSchemaState = { generation: 0, version: 0 };
            await read(new Graph(client, 'g', { schema }));
            await read(new Graph(client, 'g', { schema }));
            expect(state.sent.at(-1)?.hash).toBe(state.hashOf(state.schema));
        });

        it('drops the cached names on delete, and does not cache names from a reply that raced it', async () => {
            const { state, client } = server(names(['A'], ['p']));
            const graph = new Graph(client, 'g');
            await read(graph);

            let release!: () => void;
            state.hold = new Promise<void>((resolve) => (release = resolve));
            state.schema = names(['B'], ['q']);
            const racing = read(graph);
            await graph.delete();
            release();
            await racing;

            await read(graph);
            expect(state.sent.at(-1)?.hash).toBe('0');
        });

        it.each([
            ['number', 9007199254740992],
            ['bigint', 9007199254740993n],
        ] as const)('returns integers as a %s from the exact reply the hash needs', async (integers, expected) => {
            const { state, client } = server(names(['A'], ['p']));
            // An integer, as its digits: replies are read with exact integers
            state.valueType = 3;
            state.value = '9007199254740993';
            const graph = new Graph(client, 'g', { integers });
            expect((await read(graph)).properties.p).toBe(expected);
            expect(state.sent[0].exact).toBe(true);
        });

        it('keeps SCHEMA_HASH turned off for a copy', async () => {
            const { state, client } = server(names(['A'], ['p']));
            (client as unknown as { copy: () => Promise<string> }).copy = async () => 'OK';
            const copy = await new Graph(client, 'g', { schemaHash: false }).copy('g2');
            await read(copy);
            expect(state.sent.at(-1)?.hash).toBeUndefined();
        });

        it('sends neither SCHEMA_HASH nor exact integers when turned off', async () => {
            const { state, client } = server(names(['A'], ['p']));
            const graph = new Graph(client, 'g', { schemaHash: false });
            await read(graph);
            await read(graph, true);
            for (const sent of state.sent) {
                expect(sent.hash).toBeUndefined();
                expect(sent.exact).toBe(false);
                expect(sent.command).not.toContain('SCHEMA_HASH');
            }
            expect(state.sent[0].version).toBe(0);
        });
    });
});
