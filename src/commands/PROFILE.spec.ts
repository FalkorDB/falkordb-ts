import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './PROFILE';

/**
 * Executes a profile query on a Redis Graph.
 * @param {string} key - The key of the graph in Redis.
 * @param {string} query - The Cypher query to profile.
 * @returns {string[]} An array of strings representing the profiling results.
 * @throws {Error} If there's an issue executing the query or connecting to Redis.
 */
describe('PROFILE', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key', 'RETURN 0'),
            ['GRAPH.PROFILE', 'key', 'RETURN 0']
        );
    });

    testUtils.testWithClient('client.graph.profile', async client => {
        const reply = await client.graph.profile('key', 'RETURN 0');
        assert.ok(Array.isArray(reply));
        assert.ok(!reply.find(x => typeof x !== 'string'));
    }, GLOBAL.SERVERS.OPEN);
});
