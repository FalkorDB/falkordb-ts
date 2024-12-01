import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './INFO';

/**
 * Performs a graph information query and tests its functionality.
 * @returns {Array} An array containing two elements:
 *                  1. A string "# Running queries" followed by an empty array
 *                  2. A string "# Waiting queries" followed by an empty array
 */
describe('INFO', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments(),
            ['GRAPH.INFO']
        );
    });

    testUtils.testWithClient('client.graph.info', async client => {
        assert.deepEqual(
            await client.graph.info(),
            [
                "# Running queries",
                [],
                "# Waiting queries",
                [],

            ]
        );
    }, GLOBAL.SERVERS.OPEN);
});
