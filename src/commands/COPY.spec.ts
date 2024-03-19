import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './COPY';

describe('', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('srcKey', 'dstKey'),
            ['GRAPH.COPY', 'srcKey', 'dstKey']
        );
    });

    testUtils.testWithClient('client.graph.delete', async client => {
        await client.falkordb.query('srcKey', 'RETURN 1');

        assert.equal(
            typeof await client.falkordb.copy('srcKey', 'dstKey'),
            'string'
        );
    }, GLOBAL.SERVERS.OPEN);
});
