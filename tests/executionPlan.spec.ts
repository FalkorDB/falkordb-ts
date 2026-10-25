import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { client } from './dbConnection';
import FalkorDB from '../src/falkordb';
import Graph from '../src/graph';
import { ExecutionPlan, Operation } from '../index';
import * as EXPLAIN from '../src/commands/EXPLAIN';
import * as PROFILE from '../src/commands/PROFILE';
import * as QUERY from '../src/commands/QUERY';
import { expectExecutionPlan, expectPlanShape, expectProfile } from './planHelpers';

const EXPLAIN_LINES = [
    'Results',
    '    Sort',
    '        Project',
    '            Conditional Traverse | (a)->(b)',
    '                Node By Index Scan | (a:A)',
];

const PROFILE_LINES = [
    'Results | Records produced: 1, Execution time: 0.000149 ms',
    '    Project | Records produced: 1, Execution time: 0.000934 ms',
    '        Cartesian Product | Records produced: 1, Execution time: 0.002266 ms',
    '            Filter | Records produced: 1, Execution time: 0.019139 ms',
    '                Node By Label Scan | (a:A) | Records produced: 2, Execution time: 0.001362 ms',
    '            Node By Label Scan | (b:B) | Records produced: 1, Execution time: 0.000076 ms',
];

const names = (operations: Iterable<Operation>) => [...operations].map((op) => op.name);

describe('ExecutionPlan parser', () => {
    test('builds the operation tree of an explain plan', () => {
        const plan = new ExecutionPlan(EXPLAIN_LINES);

        expect(plan.steps).toBe(EXPLAIN_LINES);
        expect(plan.root.name).toBe('Results');
        expect(plan.root.args).toBeUndefined();
        expect(plan.root.recordsProduced).toBeUndefined();
        expect(plan.root.executionTime).toBeUndefined();

        const traverse = plan.root.children[0].children[0].children[0];
        expect(traverse.name).toBe('Conditional Traverse');
        expect(traverse.args).toBe('(a)->(b)');
        expect(traverse.children).toHaveLength(1);
        expect(traverse.children[0].name).toBe('Node By Index Scan');
        expect(traverse.children[0].args).toBe('(a:A)');
        expect(traverse.children[0].children).toEqual([]);
    });

    test('parses profile statistics as numbers and keeps them out of args', () => {
        const plan = new ExecutionPlan(PROFILE_LINES);

        expect(plan.root.recordsProduced).toBe(1);
        expect(plan.root.executionTime).toBeCloseTo(0.000149, 6);

        const [scanA, scanB] = plan.collectOperations('Node By Label Scan');
        expect(scanA.args).toBe('(a:A)');
        expect(scanA.recordsProduced).toBe(2);
        expect(scanA.executionTime).toBeCloseTo(0.001362, 6);
        expect(scanB.args).toBe('(b:B)');
        expect(scanB.recordsProduced).toBe(1);
        expect(typeof scanB.executionTime).toBe('number');
    });

    test('attaches every sibling to its parent', () => {
        const plan = new ExecutionPlan(PROFILE_LINES);
        const [cartesian] = plan.collectOperations('Cartesian Product');

        expect(names(cartesian.children)).toEqual(['Filter', 'Node By Label Scan']);
        expect(cartesian.children[0].children[0].args).toBe('(a:A)');
    });

    test('returns to the right ancestor after a deep branch', () => {
        const plan = new ExecutionPlan([
            'Results',
            '    Apply',
            '        Argument',
            '            Node By Label Scan | (a:A)',
            '        Optional',
            '            Conditional Traverse | (a)->(b)',
            '                Argument',
            '    Skip',
        ]);

        expect(names(plan.root.children)).toEqual(['Apply', 'Skip']);
        expect(names(plan.root.children[0].children)).toEqual(['Argument', 'Optional']);
        expect(plan.root.children[1].children).toEqual([]);
    });

    test('iterates over operations parents first, in plan order', () => {
        const plan = new ExecutionPlan(PROFILE_LINES);

        expect(names(plan)).toEqual([
            'Results',
            'Project',
            'Cartesian Product',
            'Filter',
            'Node By Label Scan',
            'Node By Label Scan',
        ]);
    });

    test('collectOperations finds every operation with the name', () => {
        const plan = new ExecutionPlan(PROFILE_LINES);

        expect(plan.collectOperations('Node By Label Scan')).toHaveLength(2);
        expect(plan.collectOperations('Results')).toEqual([plan.root]);
        expect(plan.collectOperations('Missing')).toEqual([]);
    });

    test('toString renders the tree without profile statistics', () => {
        expect(new ExecutionPlan(EXPLAIN_LINES).toString()).toBe(EXPLAIN_LINES.join('\n'));
        expect(new ExecutionPlan(PROFILE_LINES).toString()).toBe([
            'Results',
            '    Project',
            '        Cartesian Product',
            '            Filter',
            '                Node By Label Scan | (a:A)',
            '            Node By Label Scan | (b:B)',
        ].join('\n'));
    });

    test('keeps a `|` that is part of the arguments', () => {
        const op = Operation.fromLine('    Node By Label Scan | (a:A|B) | Records produced: 3, Execution time: 1.5 ms');

        expect(op.name).toBe('Node By Label Scan');
        expect(op.args).toBe('(a:A|B)');
        expect(op.recordsProduced).toBe(3);
        expect(op.executionTime).toBe(1.5);
        expect(op.toString()).toBe('Node By Label Scan | (a:A|B)');
    });

    test('rejects malformed plans', () => {
        expect(() => new ExecutionPlan([])).toThrow();
        expect(() => new ExecutionPlan(['    Results'])).toThrow();
        expect(() => new ExecutionPlan(['Results', '        Project'])).toThrow();
        expect(() => new ExecutionPlan(['Results', '  Project'])).toThrow();
        expect(() => new ExecutionPlan(['Results', 'Project'])).toThrow();
        // Blank lines are not operations
        expect(() => new ExecutionPlan([''])).toThrow();
        expect(() => new ExecutionPlan(['Results', '    '])).toThrow();
    });
});

describe('EXPLAIN and PROFILE arguments', () => {
    test('are unchanged without params', () => {
        expect(EXPLAIN.transformArguments('g', 'RETURN 1')).toEqual(['GRAPH.EXPLAIN', 'g', 'RETURN 1']);
        expect(PROFILE.transformArguments('g', 'RETURN 1', {})).toEqual(['GRAPH.PROFILE', 'g', 'RETURN 1']);
    });

    test('carry params in the CYPHER header GRAPH.QUERY sends', () => {
        const params = { v: 'a"b', n: [1, null] };
        const [, , header] = QUERY.transformArguments('g', 'RETURN $v', { params });
        expect(header).toMatch(/^CYPHER .* RETURN \$v$/);
        expect(EXPLAIN.transformArguments('g', 'RETURN $v', { params }))
            .toEqual(['GRAPH.EXPLAIN', 'g', header]);
        expect(PROFILE.transformArguments('g', 'RETURN $v', { params }))
            .toEqual(['GRAPH.PROFILE', 'g', header]);
    });
});

describe('explain and profile against the server', () => {
    const graphName = `pr-plan-${process.pid}-${Date.now()}`;
    const QUERY = 'MATCH (a:A), (b:B) WHERE a.x = $v RETURN a, b';
    let db: FalkorDB;
    let graph: Graph;

    beforeAll(async () => {
        db = await client();
        graph = db.selectGraph(graphName);
        await graph.query('CREATE (:A {x: 1}), (:A {x: 2}), (:B)');
    });

    afterAll(async () => {
        await graph.delete();
        await db.close();
    });

    test('explain and profile without params return a parsed plan', async () => {
        const explained = await graph.explain('MATCH (a:A) RETURN a');
        expect(explained).toBeInstanceOf(ExecutionPlan);
        expectPlanShape(explained, ['Project', '    Node By Label Scan | (a:A)']);

        const profiled = await graph.profile('MATCH (a:A) RETURN a');
        expect(profiled).toBeInstanceOf(ExecutionPlan);
        expectProfile(profiled, 2, 2);
    });

    test('explain and profile accept params', async () => {
        const explained = await graph.explain(QUERY, { params: { v: 1 } });
        expectExecutionPlan(explained, 4);
        expect(explained.steps.some((line) => line.includes('Cartesian Product'))).toBe(true);

        const profiled = await graph.profile(QUERY, { params: { v: 1 } });
        // Only the first A matches, joined with the single B
        expectProfile(profiled, 4, 1);
    });

    test('profile without the params it needs is rejected', async () => {
        await expect(graph.profile(QUERY)).rejects.toThrow();
    });

    test('explain parses the plan into an operation tree', async () => {
        const plan = await graph.explain(QUERY, { params: { v: 1 } });

        // The raw lines stay available exactly as the command replied them
        const connection = await db.connection;
        const lines = await connection.falkordb.explain(graphName, QUERY, { params: { v: 1 } });
        expect(plan.steps).toEqual(lines);

        const [cartesian] = plan.collectOperations('Cartesian Product');
        expect(cartesian.children.length).toBeGreaterThanOrEqual(2);

        const scans = plan.collectOperations('Node By Label Scan').map((op) => op.args);
        expect(scans).toEqual(expect.arrayContaining(['(a:A)', '(b:B)']));
        for (const op of plan) {
            expect(op.recordsProduced).toBeUndefined();
            expect(op.executionTime).toBeUndefined();
        }
    });

    test('profile parses statistics as numbers', async () => {
        const plan = await graph.profile(QUERY, { params: { v: 1 } });

        expect(plan.root.recordsProduced).toBe(1);
        for (const op of plan) {
            expect(Number.isInteger(op.recordsProduced)).toBe(true);
            expect(typeof op.executionTime).toBe('number');
            expect(op.executionTime).toBeGreaterThanOrEqual(0);
        }
    });
});
