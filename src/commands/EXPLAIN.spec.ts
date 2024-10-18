import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './EXPLAIN';

/**
 * Explains the execution plan of a graph query
 * @param {string} key - The key of the graph
 * @param {string} query - The graph query to explain
 * @returns {string[]} An array of strings describing the execution plan
 */
describe('EXPLAIN', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key', 'RETURN 0'),
            ['GRAPH.EXPLAIN', 'key', 'RETURN 0']
        );
    });

    testUtils.testWithClient('client.graph.explain', async client => {
        const [, reply] = await Promise.all([
            client.graph.query('key', 'RETURN 0'), // make sure to create a graph first
            client.graph.explain('key', 'RETURN 0')
        ]);
        assert.ok(Array.isArray(reply));
        assert.ok(!reply.find(x => typeof x !== 'string'));
    }, GLOBAL.SERVERS.OPEN);
});
