import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './QUERY';

/**
 * Executes a graph query on a specified key.
 * @param {string} key - The key associated with the graph to query.
 * @param {string} query - The graph query to execute.
 * @returns {Promise<Object>} A promise that resolves to an object containing the query results.
 * @throws {Error} If the query execution fails.
 */
describe('QUERY', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key', 'query'),
            ['GRAPH.QUERY', 'key', 'query']
        );
    });

    testUtils.testWithClient('client.graph.query', async client => {
        const { data } = await client.graph.query('key', 'RETURN 0');
        assert.deepEqual(data, [[0]]);
    }, GLOBAL.SERVERS.OPEN);
});
