import { strict as assert } from 'assert';
import { transformArguments } from './SENTINEL_MASTERS';

describe('SENTINEL MASTERS', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments(),
            ['SENTINEL', 'MASTERS']
        );
    });
});
