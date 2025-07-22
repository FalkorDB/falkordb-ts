import { strict as assert } from 'assert';
import { transformArguments } from './SENTINEL_MASTER';

describe('SENTINEL MASTER', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('mymaster'),
            ['SENTINEL', 'MASTER', 'mymaster']
        );
    });
});
