import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './SLOWLOG';

/**
 * Executes and tests the SLOWLOG command for a Redis Graph
 * @param {string} key - The key of the graph to query
 * @returns {Array} An array containing the slow log entries for the specified graph
 * 
 * @example
 * const reply = await client.graph.slowLog('key');
 * assert.equal(reply.length, 1);
 */
describe('SLOWLOG', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key'),
            ['GRAPH.SLOWLOG', 'key']
        );
    });

    testUtils.testWithClient('client.graph.slowLog', async client => {
        await client.graph.query('key', 'RETURN 1');
        const reply = await client.graph.slowLog('key');
		assert.equal(reply.length, 1);
    }, GLOBAL.SERVERS.OPEN);
});
