import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './COPY';

/**
 * Copies a graph from a source key to a destination key.
 * @param {string} srcKey - The key of the source graph to be copied.
 * @param {string} dstKey - The key where the copied graph will be stored.
 * @returns {string} A confirmation message or status of the copy operation.
 * @throws {Error} If the copy operation fails or if the source key does not exist.
 */
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
