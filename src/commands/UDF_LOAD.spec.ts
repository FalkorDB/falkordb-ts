import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './UDF_LOAD';

describe('UDF_LOAD', () => {
    it('transformArguments with string script', () => {
        assert.deepEqual(
            transformArguments('mylib', 'function add(a, b) { return a + b; }'),
            ['GRAPH.UDF', 'LOAD', 'mylib', 'function add(a, b) { return a + b; }']
        );
    });

    it('transformArguments with string script and replace', () => {
        assert.deepEqual(
            transformArguments('mylib', 'function add(a, b) { return a + b; }', true),
            ['GRAPH.UDF', 'LOAD', 'REPLACE', 'mylib', 'function add(a, b) { return a + b; }']
        );
    });

    it('transformArguments with function', () => {
        const fn = function add(a: number, b: number) { return a + b; };
        const args = transformArguments('mylib', fn);
        assert.equal(args[0], 'GRAPH.UDF');
        assert.equal(args[1], 'LOAD');
        assert.equal(args[2], 'mylib');
        assert.ok(args[3].includes('function add'));
    });

    it('transformArguments with function and replace', () => {
        const fn = function add(a: number, b: number) { return a + b; };
        const args = transformArguments('mylib', fn, true);
        assert.equal(args[0], 'GRAPH.UDF');
        assert.equal(args[1], 'LOAD');
        assert.equal(args[2], 'REPLACE');
        assert.equal(args[3], 'mylib');
        assert.ok(args[4].includes('function add'));
    });

    testUtils.testWithClient('client.graph.udfLoad', async client => {
        const script = `function hello() { return "world"; }
falkor.register("hello", hello);`;
        const result = await client.graph.udfLoad('mylib', script);
        assert.equal(typeof result, 'string');
    }, GLOBAL.SERVERS.OPEN);
});
