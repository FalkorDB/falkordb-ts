import { strict as assert } from 'assert';
import { transformArguments, IS_READ_ONLY } from './INFO';

describe('INFO', () => {
    describe('transformArguments', () => {
        it('without section parameter', () => {
            assert.deepEqual(
                transformArguments(),
                ['GRAPH.INFO']
            );
        });

        it('with section parameter', () => {
            assert.deepEqual(
                transformArguments('STATISTICS'),
                ['GRAPH.INFO', 'STATISTICS']
            );
        });

        it('with different section values', () => {
            // Test various section types
            assert.deepEqual(
                transformArguments('MEMORY'),
                ['GRAPH.INFO', 'MEMORY']
            );

            assert.deepEqual(
                transformArguments('CPU'),
                ['GRAPH.INFO', 'CPU']
            );

            assert.deepEqual(
                transformArguments('REPLICATION'),
                ['GRAPH.INFO', 'REPLICATION']
            );
        });

        it('with empty string section', () => {
            // Empty string should not add the section parameter
            assert.deepEqual(
                transformArguments(''),
                ['GRAPH.INFO']
            );
        });

        it('with undefined section', () => {
            assert.deepEqual(
                transformArguments(undefined),
                ['GRAPH.INFO']
            );
        });
    });

    describe('constants', () => {
        it('IS_READ_ONLY should be true', () => {
            assert.strictEqual(IS_READ_ONLY, true);
        });
    });
});
