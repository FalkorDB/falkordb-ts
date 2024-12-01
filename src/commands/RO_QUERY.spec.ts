import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './RO_QUERY';

/**
 * Executes a read-only query on a RedisGraph key
 * @param {string} key - The RedisGraph key to query
 * @param {string} query - The Cypher query to execute
 * @returns {Promise<Array>} An array containing the query results
 */
describe('RO_QUERY', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key', 'query'),
            ['GRAPH.RO_QUERY', 'key', 'query']
        );
    });

    testUtils.testWithClient('client.graph.roQuery', async client => {
        const [, { data }] = await Promise.all([
            client.graph.query('key', 'RETURN 0'), // make sure to create a graph first
            client.graph.roQuery('key', 'RETURN 0')
        ]);
        assert.deepEqual(data, [[0]]);
    }, GLOBAL.SERVERS.OPEN);
});