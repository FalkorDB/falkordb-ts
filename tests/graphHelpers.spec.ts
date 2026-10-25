import { jest, describe, it, beforeAll, afterAll, afterEach, expect } from '@jest/globals';
import { client } from './dbConnection';
import FalkorDB from '../src/falkordb';
import Graph, { ConstraintType, EntityType } from '../src/graph';
import type { Client } from '../src/clients/client';
import * as SLOWLOG_RESET from '../src/commands/SLOWLOG_RESET';
import type { ConstraintInfo, IndexInfo, VectorIndexOptions } from '../index';

async function waitForConstraints(
    graph: Graph,
    expectedCount: number,
    timeoutMs = 10000
): Promise<ConstraintInfo[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const constraints = await graph.listConstraints();
        if (constraints.length === expectedCount &&
            constraints.every(c => c.status !== 'UNDER CONSTRUCTION')) {
            return constraints;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    return graph.listConstraints();
}

describe('Graph helpers', () => {
    let db: FalkorDB;
    const created = new Set<Graph>();

    // Graph names are unique to this suite so it can share a server
    const selectGraph = (suffix: string) => {
        const graph = db.selectGraph(`pr-helpers-${suffix}`);
        created.add(graph);
        return graph;
    };

    beforeAll(async () => {
        db = await client();
    });

    afterEach(async () => {
        // Only a graph the test never created may be missing
        const existing = await db.list();
        for (const graph of created) {
            if (existing.includes(graph.name)) await graph.delete();
        }
        created.clear();
    });

    afterAll(async () => {
        await db.close();
    });

    describe('name', () => {
        it('returns the graph name', () => {
            expect(db.selectGraph('pr-helpers-name').name).toBe('pr-helpers-name');
        });
    });

    describe('slowLogReset', () => {
        it('builds GRAPH.SLOWLOG <graph> RESET', () => {
            expect(SLOWLOG_RESET.transformArguments('g')).toEqual(['GRAPH.SLOWLOG', 'g', 'RESET']);
        });

        it('clears the slow log', async () => {
            const graph = selectGraph('slowlog');
            // Only queries slower than a threshold are logged
            await graph.query('UNWIND range(1, 1000000) AS x WITH x WHERE x % 7 = 0 RETURN count(x)');
            expect((await graph.slowLog()).length).toBeGreaterThan(0);

            await expect(graph.slowLogReset()).resolves.toBeUndefined();
            expect(await graph.slowLog()).toEqual([]);
        });
    });

    describe('callProcedure', () => {
        it('calls a procedure without arguments', async () => {
            const graph = selectGraph('proc');
            await graph.query('CREATE (:A)-[:R]->(:B)');
            const reply = await graph.callProcedure<{ label: string }>('db.labels');
            expect(reply.data).toEqual([{ label: 'A' }, { label: 'B' }]);
        });

        it('passes arguments as parameters and yields the given columns', async () => {
            const graph = selectGraph('proc');
            await graph.query(`CREATE (:Movie {title: 'The Jungle Book'}), (:Movie {title: 'Heat'})`);
            await graph.createNodeFulltextIndex('Movie', 'title');

            // Quotes in an argument need no escaping
            const reply = await graph.callProcedure<{ node: { properties: { title: string } } }>(
                'db.idx.fulltext.queryNodes',
                ['Movie', "Jungle'"],
                { yields: ['node'], timeout: 1000 }
            );

            expect(reply.data).toHaveLength(1);
            expect(Object.keys(reply.data![0])).toEqual(['node']);
            expect(reply.data![0].node.properties.title).toBe('The Jungle Book');
        });

        // Checked against a stub client: write procedures and their
        // signatures differ between server versions
        it('is read-only by default', async () => {
            const reply = { headers: undefined, data: undefined, metadata: [] };
            const calls: string[] = [];
            const stub = {
                roQuery: async () => { calls.push('roQuery'); return reply; },
                query: async () => { calls.push('query'); return reply; },
            } as unknown as Client;
            const graph = new Graph(stub, 'proc');

            await graph.callProcedure('db.labels');
            await graph.callProcedure('db.labels', [], { readOnly: false });

            expect(calls).toEqual(['roQuery', 'query']);
        });
    });

    describe('listIndices', () => {
        it('lists indexes on labels and properties that need quoting', async () => {
            const graph = selectGraph('indices');
            await graph.query("CREATE (:`Product Type` {`sku-id`: 1})-[:`made by` {`sku-id`: 2}]->(:A)");

            await graph.createNodeRangeIndex('Product Type', 'sku-id');
            await graph.createEdgeRangeIndex('made by', 'sku-id');

            const indexes = await graph.listIndices();
            expect(indexes.map(i => [i.label, i.properties])).toEqual(expect.arrayContaining([
                ['Product Type', ['sku-id']],
                ['made by', ['sku-id']],
            ]));

            await graph.dropNodeRangeIndex('Product Type', 'sku-id');
            await graph.dropEdgeRangeIndex('made by', 'sku-id');
            expect(await graph.listIndices()).toEqual([]);
        });

        it('returns an empty list when there are no indexes', async () => {
            const graph = selectGraph('indices');
            await graph.query('CREATE (:A)');
            expect(await graph.listIndices()).toEqual([]);
        });

        it('lists node and edge indexes with their options', async () => {
            const graph = selectGraph('indices');
            await graph.query('CREATE (:Person {name: "a"})-[:KNOWS {since: 1}]->(:Person {name: "b"})');
            await graph.createNodeRangeIndex('Person', 'name');
            await graph.createNodeVectorIndex('Person', { dimension: 3, similarityFunction: 'cosine' }, 'embedding');
            await graph.createEdgeRangeIndex('KNOWS', 'since');

            const indices: IndexInfo[] = await graph.listIndices();
            const person = indices.find(i => i.label === 'Person')!;
            const knows = indices.find(i => i.label === 'KNOWS')!;

            expect(person).toEqual(expect.objectContaining({
                properties: ['name', 'embedding'],
                types: { name: ['RANGE'], embedding: ['VECTOR'] },
                entityType: 'NODE',
                language: 'english',
                stopwords: expect.any(Array),
                status: expect.any(String),
                info: expect.any(Object),
            }));
            expect(person.options.embedding).toEqual(expect.objectContaining({
                dimension: 3,
                similarityFunction: 'cosine',
            }));
            expect(person).not.toHaveProperty('entitytype');
            expect(knows).toEqual(expect.objectContaining({
                properties: ['since'],
                entityType: 'RELATIONSHIP',
            }));
        });
    });

    describe('vector index options', () => {
        it('rejects the positional form removed in v7', async () => {
            const graph = selectGraph('vector');
            await graph.query('CREATE (:A)-[:R]->(:A)');

            // Plain JavaScript callers still get a clear error instead of a malformed query
            // @ts-expect-error the (label, dimension, similarityFunction, ...properties) form is gone
            await expect(graph.createNodeVectorIndex('A', 4, 'cosine', 'v')).rejects.toThrow(TypeError);
            // @ts-expect-error the (label, dimension, similarityFunction, ...properties) form is gone
            await expect(graph.createEdgeVectorIndex('R', 4, 'cosine', 'v')).rejects.toThrow(TypeError);
            expect(await graph.listIndices()).toEqual([]);
        });

        it('requires a dimension', async () => {
            // @ts-expect-error dimension is required
            const options: VectorIndexOptions = { similarityFunction: 'cosine' };
            const graph = selectGraph('vector');
            await expect(graph.createNodeVectorIndex('A', options, 'v'))
                .rejects.toThrow(new TypeError('Vector index options must include a numeric dimension'));
        });

        it('accepts an options object with HNSW parameters', async () => {
            const graph = selectGraph('vector');
            await graph.query('CREATE (:A)-[:R]->(:A)');
            const options: VectorIndexOptions = {
                dimension: 16,
                similarityFunction: 'cosine',
                M: 8,
                efConstruction: 100,
                efRuntime: 5,
            };
            await graph.createNodeVectorIndex('A', options, 'v1', 'v2');
            await graph.createEdgeVectorIndex('R', { dimension: 4 }, 'v');

            const indices = await graph.listIndices();
            const node = indices.find(i => i.entityType === 'NODE')!;
            const edge = indices.find(i => i.entityType === 'RELATIONSHIP')!;
            expect(node.properties).toEqual(['v1', 'v2']);
            expect(node.options.v1).toEqual(options);
            expect(node.options.v2).toEqual(options);
            expect(edge.options.v).toEqual(expect.objectContaining({ dimension: 4, similarityFunction: 'euclidean' }));
        });
    });

    describe('constraints', () => {
        it('creates, lists and drops node constraints', async () => {
            const graph = selectGraph('constraints');
            await graph.query(`CREATE (:Person {name: 'Alice', id: 1})`);

            await graph.createNodeUniqueConstraint('Person', 'name', 'id');
            await graph.createNodeMandatoryConstraint('Person', 'name');

            const constraints = await waitForConstraints(graph, 2);
            expect(constraints).toEqual(expect.arrayContaining([
                { type: 'UNIQUE', label: 'Person', properties: ['name', 'id'], entityType: 'NODE', status: 'OPERATIONAL' },
                { type: 'MANDATORY', label: 'Person', properties: ['name'], entityType: 'NODE', status: 'OPERATIONAL' },
            ]));
            expect(constraints).toHaveLength(2);

            // The unique constraint is enforced
            await expect(graph.query(`CREATE (:Person {name: 'Alice', id: 1})`)).rejects.toThrow();

            await graph.dropNodeUniqueConstraint('Person', 'name', 'id');
            await graph.dropNodeMandatoryConstraint('Person', 'name');
            expect(await graph.listConstraints()).toEqual([]);

            // The supporting range indexes are kept
            const [index] = await graph.listIndices();
            expect(index.types).toEqual({ name: ['RANGE'], id: ['RANGE'] });
        });

        it('creates, lists and drops edge constraints', async () => {
            const graph = selectGraph('constraints');
            await graph.query('CREATE (:P)-[:KNOWS {since: 2020}]->(:P)');

            await graph.createEdgeUniqueConstraint('KNOWS', 'since');
            await graph.createEdgeMandatoryConstraint('KNOWS', 'since');

            const constraints = await waitForConstraints(graph, 2);
            expect(constraints).toEqual(expect.arrayContaining([
                { type: 'UNIQUE', label: 'KNOWS', properties: ['since'], entityType: 'RELATIONSHIP', status: 'OPERATIONAL' },
                { type: 'MANDATORY', label: 'KNOWS', properties: ['since'], entityType: 'RELATIONSHIP', status: 'OPERATIONAL' },
            ]));

            await graph.dropEdgeUniqueConstraint('KNOWS', 'since');
            await graph.dropEdgeMandatoryConstraint('KNOWS', 'since');
            expect(await graph.listConstraints()).toEqual([]);
        });

        it('creates a unique constraint when some properties are already indexed', async () => {
            const graph = selectGraph('constraints');
            await graph.query(`CREATE (:Person {name: 'Alice', id: 1})-[:KNOWS {since: 1}]->(:Person {name: 'Bob', id: 2})`);
            await graph.createNodeRangeIndex('Person', 'name');
            await graph.createEdgeRangeIndex('KNOWS', 'since');

            await graph.createNodeUniqueConstraint('Person', 'name', 'id');
            await graph.createEdgeUniqueConstraint('KNOWS', 'since');

            const constraints = await waitForConstraints(graph, 2);
            expect(constraints.map(c => c.status)).toEqual(['OPERATIONAL', 'OPERATIONAL']);
            const person = (await graph.listIndices()).find(i => i.label === 'Person')!;
            expect(person.types).toEqual({ name: ['RANGE'], id: ['RANGE'] });
        });

        it('constraintCreate(UNIQUE) creates the range indexes it requires', async () => {
            const graph = selectGraph('constraints');
            await graph.query(`CREATE (:Person {name: 'Alice', id: 1})-[:KNOWS {since: 1}]->(:Person {name: 'Bob', id: 2})`);
            // One property already indexed, the others not
            await graph.createNodeRangeIndex('Person', 'id');

            await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'name', 'id');
            await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.RELATIONSHIP, 'KNOWS', 'since');

            const constraints = await waitForConstraints(graph, 2);
            expect(constraints.map(c => c.status)).toEqual(['OPERATIONAL', 'OPERATIONAL']);
            const indices = await graph.listIndices();
            expect(indices.find(i => i.label === 'Person')!.types).toEqual({ id: ['RANGE'], name: ['RANGE'] });
            expect(indices.find(i => i.label === 'KNOWS')).toEqual(expect.objectContaining({
                entityType: 'RELATIONSHIP',
                types: { since: ['RANGE'] },
            }));
        });

        it('constraintCreate(MANDATORY) creates no index', async () => {
            const graph = selectGraph('constraints');
            await graph.query(`CREATE (:Person {name: 'Alice'})-[:KNOWS {since: 1}]->(:Person {name: 'Bob'})`);

            await graph.constraintCreate(ConstraintType.MANDATORY, EntityType.NODE, 'Person', 'name');
            await graph.constraintCreate(ConstraintType.MANDATORY, EntityType.RELATIONSHIP, 'KNOWS', 'since');

            const constraints = await waitForConstraints(graph, 2);
            expect(constraints.map(c => c.status)).toEqual(['OPERATIONAL', 'OPERATIONAL']);
            expect(await graph.listIndices()).toEqual([]);
        });

        it('reports a constraint the existing data violates as FAILED', async () => {
            const graph = selectGraph('constraints');
            await graph.query(`CREATE (:Person {name: 'Alice'}), (:Person {name: 'Alice'})`);

            await graph.createNodeUniqueConstraint('Person', 'name');

            const [constraint] = await waitForConstraints(graph, 1);
            expect(constraint.status).toBe('FAILED');
        });

        it('rethrows index errors other than "already indexed"', async () => {
            const error = new Error('index creation failed');
            const constraintCreate = jest.fn();
            const stub = {
                query: async (_graph: string, query: string) => {
                    if (query.startsWith('CREATE INDEX')) throw error;
                    return { metadata: [] };
                },
                constraintCreate,
            } as unknown as Client;
            const graph = new Graph(stub, 'constraints');

            await expect(graph.createNodeUniqueConstraint('Person', 'name')).rejects.toBe(error);
            expect(constraintCreate).not.toHaveBeenCalled();
        });

        it('rejects names the server does not accept for a constraint', async () => {
            const graph = selectGraph('constraints');
            await graph.query("CREATE (:`Product Type` {`sku-id`: 1})");

            await expect(graph.createNodeUniqueConstraint('Product Type', 'id')).rejects.toThrow(new TypeError(
                'Label name "Product Type" is invalid for a constraint: start with a letter or _, followed by letters, digits, _ or $'
            ));
            await expect(graph.createEdgeMandatoryConstraint('R', 'sku-id')).rejects.toThrow(
                'Property name "sku-id" is invalid for a constraint'
            );
            // Rejected before any supporting index was created
            expect(await graph.listIndices()).toEqual([]);
        });

        it('still rejects a duplicate unique constraint', async () => {
            const graph = selectGraph('constraints');
            await graph.query(`CREATE (:Person {name: 'Alice'})`);
            await graph.createNodeUniqueConstraint('Person', 'name');
            await expect(graph.createNodeUniqueConstraint('Person', 'name')).rejects.toThrow();
        });
    });
});
