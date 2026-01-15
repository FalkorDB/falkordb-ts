import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './UDF_DELETE';

describe('UDF_DELETE', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('mylib'),
            ['GRAPH.UDF', 'DELETE', 'mylib']
        );
    });

    testUtils.testWithClient('client.graph.udfDelete', async client => {
        // First load a UDF to delete
        const script = `function test() { return "ok"; }
falkor.register("test", test);`;
        await client.graph.udfLoad('testlib', script);
        
        // Then delete it
        const result = await client.graph.udfDelete('testlib');
        assert.equal(typeof result, 'string');
    }, GLOBAL.SERVERS.OPEN);
});
