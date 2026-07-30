import { strict as assert } from 'assert';
import { transformArguments, transformReply, IS_READ_ONLY } from './STUBS';

describe('STUBS', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments(),
            ['GRAPH.STUBS']
        );
    });

    it('IS_READ_ONLY', () => {
        assert.equal(IS_READ_ONLY, true);
    });

    it('transformReply', () => {
        assert.deepEqual(
            transformReply(['offloaded-graph', 'another-graph']),
            ['offloaded-graph', 'another-graph']
        );
    });
});
