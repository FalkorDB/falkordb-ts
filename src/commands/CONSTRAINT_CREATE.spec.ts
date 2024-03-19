import { strict as assert } from 'assert';
import testUtils, { GLOBAL } from '../test-utils';
import { ConstraintType, EntityType, transformArguments } from './CONSTRAINT_CREATE';

describe('', () => {
    it('transformArguments', () => {
        assert.deepEqual(
            transformArguments('key', ConstraintType.UNIQUE, EntityType.NODE, 'label', 'prop1', 'prop2'),
            ['GRAPH.CONSTRAINT', 'CREATE', 'key', 'UNIQUE', 'NODE', 'label', 'PROPERTIES', '2', 'prop1', 'prop2']
        );
    });

    testUtils.testWithClient('client.graph.delete', async client => {
        await client.falkordb.query('key', 'RETURN 1');

        assert.equal(
            await client.falkordb.constraintCreate('key', ConstraintType.UNIQUE, EntityType.NODE, 'label', 'prop1', 'prop2'),
            'pending'
        );
    }, GLOBAL.SERVERS.OPEN);
});
