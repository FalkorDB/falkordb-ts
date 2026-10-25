import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import * as vm from 'node:vm';
import { Temporal } from '@js-temporal/polyfill';
import { client } from './dbConnection';
import FalkorDB from '../src/falkordb';
import {
    nodeToString, edgeToString, pathToString, nodesEqual, edgesEqual, pathsEqual,
} from '../index';
import type { GraphEdge, GraphNode, GraphPath } from '../index';

const alice: GraphNode = { id: 0, labels: ['Person'], properties: { name: 'Alice', age: 30 } };
const bob: GraphNode = { id: 1, labels: ['Person'], properties: { name: 'Bob' } };
const knows: GraphEdge = {
    id: 0, relationshipType: 'KNOWS', sourceId: 0, destinationId: 1, properties: { since: 2020 },
};

describe('Entity helpers', () => {
    describe('toString', () => {
        it('writes a node as a Cypher pattern with sorted properties', () => {
            expect(nodeToString(alice)).toBe('(:Person{age:30,name:"Alice"})');
            expect(nodeToString({ id: 2, labels: [], properties: {} })).toBe('()');
        });

        it('quotes names that are not plain identifiers and escapes strings', () => {
            const node: GraphNode = {
                id: 3,
                labels: ['Product Type', 'A'],
                properties: { 'sku-id': 'a"b\\c', tags: ['x', 1], meta: { 'k v': null } },
            };
            expect(nodeToString(node)).toBe(
                '(:`Product Type`:A{meta:{`k v`:null},`sku-id`:"a\\"b\\\\c",tags:["x",1]})'
            );
        });

        it('escapes backticks in names and quotes empty ones', () => {
            const node: GraphNode = { id: 5, labels: ['a`b'], properties: { '': 1 } };
            expect(nodeToString(node)).toBe('(:`a``b`{``:1})');
        });

        it('writes maps with a null prototype or from another realm as maps', () => {
            const bare = Object.assign(Object.create(null), { age: 30 });
            const foreign = vm.runInNewContext('({ age: 31 })');
            const node: GraphNode = { id: 6, labels: [], properties: { bare, foreign } };
            expect(nodeToString(node)).toBe('({bare:{age:30},foreign:{age:31}})');
        });

        it('writes dates and times as their ISO form', () => {
            const node: GraphNode = { id: 4, labels: [], properties: { born: Temporal.PlainDate.from('2000-01-02') } };
            expect(nodeToString(node)).toBe('({born:2000-01-02})');
        });

        it('writes an edge as a Cypher pattern', () => {
            expect(edgeToString(knows)).toBe('()-[:KNOWS{since:2020}]->()');
            expect(edgeToString({ ...knows, properties: {} })).toBe('()-[:KNOWS]->()');
        });

        it('writes a path as ids, each edge pointing the way it runs', () => {
            const carol: GraphNode = { id: 2, labels: [], properties: {} };
            const back: GraphEdge = { id: 1, relationshipType: 'KNOWS', sourceId: 2, destinationId: 1, properties: {} };
            expect(pathToString({ nodes: [alice, bob, carol], edges: [knows, back] })).toBe('<(0)-[0]->(1)<-[1]-(2)>');
            expect(pathToString({ nodes: [alice], edges: [] })).toBe('<(0)>');
        });
    });

    describe('equality', () => {
        it('compares nodes by id, labels and properties', () => {
            expect(nodesEqual(alice, { ...alice, properties: { age: 30, name: 'Alice' } })).toBe(true);
            expect(nodesEqual(alice, { ...alice, id: 9 })).toBe(false);
            expect(nodesEqual(alice, { ...alice, labels: ['Admin'] })).toBe(false);
            expect(nodesEqual(alice, { ...alice, properties: { name: 'Alice', age: 31 } })).toBe(false);
            expect(nodesEqual(alice, { ...alice, properties: { name: 'Alice' } })).toBe(false);
        });

        it('compares maps by content whatever their prototype or realm', () => {
            const withMap = (meta: object): GraphNode => ({ id: 0, labels: [], properties: { meta } as GraphNode['properties'] });
            const bare = (age: number) => Object.assign(Object.create(null), { age });
            const foreign = (age: number) => vm.runInNewContext(`({ age: ${age} })`);
            expect(nodesEqual(withMap(bare(30)), withMap(bare(30)))).toBe(true);
            expect(nodesEqual(withMap(bare(30)), withMap({ age: 30 }))).toBe(true);
            expect(nodesEqual(withMap(foreign(1)), withMap(foreign(1)))).toBe(true);
            expect(nodesEqual(withMap(foreign(1)), withMap(foreign(2)))).toBe(false);
            // Two maps from the same context share a constructor
            const context = vm.createContext();
            const [x1, x2] = vm.runInContext('[{ x: 1 }, { x: 2 }]', context);
            expect(nodesEqual(withMap(x1), withMap(x2))).toBe(false);
        });

        it('treats NaN as equal to itself', () => {
            const node: GraphNode = { id: 0, labels: [], properties: { x: NaN } };
            expect(nodesEqual(node, { ...node, properties: { x: NaN } })).toBe(true);
            expect(nodesEqual(node, { ...node, properties: { x: 0 } })).toBe(false);
        });

        it('compares dates and times by value', () => {
            const at = (date: string): GraphNode => ({ id: 0, labels: [], properties: { at: Temporal.PlainDate.from(date) } });
            expect(nodesEqual(at('2020-01-01'), at('2020-01-01'))).toBe(true);
            expect(nodesEqual(at('2020-01-01'), at('2021-01-01'))).toBe(false);
        });

        it('treats edges with the same id as equal, and otherwise compares their content', () => {
            expect(edgesEqual(knows, { ...knows, properties: {} })).toBe(true);
            expect(edgesEqual(knows, { ...knows, id: 7 })).toBe(true);
            expect(edgesEqual(knows, { ...knows, id: 7, destinationId: 5 })).toBe(false);
            expect(edgesEqual(knows, { ...knows, id: 7, relationshipType: 'LIKES' })).toBe(false);
        });

        it('compares paths node by node and edge by edge', () => {
            const path: GraphPath = { nodes: [alice, bob], edges: [knows] };
            expect(pathsEqual(path, { nodes: [{ ...alice }, { ...bob }], edges: [{ ...knows }] })).toBe(true);
            expect(pathsEqual(path, { nodes: [alice], edges: [] })).toBe(false);
            expect(pathsEqual(path, { nodes: [bob, alice], edges: [knows] })).toBe(false);
        });
    });

    describe('on query results', () => {
        let db: FalkorDB;
        const graphName = `entity-helpers-${process.pid}-${Date.now()}`;

        beforeAll(async () => {
            db = await client();
        });

        afterAll(async () => {
            // `db` is unset when connecting failed
            if (!db) return;
            if ((await db.list()).includes(graphName)) await db.selectGraph(graphName).delete();
            await db.close();
        });

        it('works on the nodes, edges and paths a query returns', async () => {
            const graph = db.selectGraph(graphName);
            await graph.query("CREATE (:Person {name: 'Alice'})-[:KNOWS {since: 2020}]->(:Person {name: 'Bob'})");

            type Row = { a: GraphNode; r: GraphEdge; p: GraphPath };
            const query = 'MATCH p = (a:Person {name: "Alice"})-[r]->() RETURN a, r, p';
            const [first] = (await graph.query<Row>(query)).data!;
            const [second] = (await graph.roQuery<Row>(query)).data!;

            expect(nodeToString(first.a)).toBe('(:Person{name:"Alice"})');
            expect(edgeToString(first.r)).toBe('()-[:KNOWS{since:2020}]->()');
            expect(pathToString(first.p)).toBe(`<(${first.a.id})-[${first.r.id}]->(${first.p.nodes[1].id})>`);
            expect(nodesEqual(first.a, second.a)).toBe(true);
            expect(edgesEqual(first.r, second.r)).toBe(true);
            expect(pathsEqual(first.p, second.p)).toBe(true);
        });
    });
});
