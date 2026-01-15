import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './UDF_FLUSH';

describe('UDF_FLUSH', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments(),
            ['GRAPH.UDF', 'FLUSH']
        );
    });

    testUtils.testWithClient('client.graph.udfFlush', async client => {
        const result = await client.graph.udfFlush();
        assert.equal(typeof result, 'string');
    }, GLOBAL.SERVERS.OPEN);
});
