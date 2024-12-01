import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './DELETE';

/**
 * Deletes a graph from the Redis database.
 * @param {string} key - The key identifying the graph to be deleted.
 * @returns {string} A status message indicating the result of the deletion operation.
 */
describe('', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key'),
            ['GRAPH.DELETE', 'key']
        );
    });

    testUtils.testWithClient('client.graph.delete', async client => {
        await client.graph.query('key', 'RETURN 1');

        assert.equal(
            typeof await client.graph.delete('key'),
            'string'
        );
    }, GLOBAL.SERVERS.OPEN);
});
