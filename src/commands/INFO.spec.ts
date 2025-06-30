import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { transformArguments } from './INFO';

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
