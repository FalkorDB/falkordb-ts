import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './UDF_LIST';

describe('UDF_LIST', () => {
    it('transformArguments without parameters', () => {
        assert.deepEqual(
            transformArguments(),
            ['GRAPH.UDF', 'LIST']
        );
    });

    it('transformArguments with lib name', () => {
        assert.deepEqual(
            transformArguments('mylib'),
            ['GRAPH.UDF', 'LIST', 'mylib']
        );
    });

    it('transformArguments with withCode', () => {
        assert.deepEqual(
            transformArguments(undefined, true),
            ['GRAPH.UDF', 'LIST', 'WITHCODE']
        );
    });

    it('transformArguments with lib name and withCode', () => {
        assert.deepEqual(
            transformArguments('mylib', true),
            ['GRAPH.UDF', 'LIST', 'mylib', 'WITHCODE']
        );
    });

    testUtils.testWithClient('client.graph.udfList', async client => {
        const result = await client.graph.udfList();
        assert.ok(Array.isArray(result));
    }, GLOBAL.SERVERS.OPEN);
});
