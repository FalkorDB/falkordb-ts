import { describe, it, expect } from '@jest/globals';
import type {
  QueryParam,
  QueryParams,
  QueryOptions,
  QueryOptionsBackwardCompatible,
} from '../index';
import { pushQueryArguments } from '../src/commands';

describe('Exported Types', () => {
  it('QueryParam accepts every supported value kind', () => {
    const values: QueryParam[] = [
      'text',
      42,
      true,
      null,
      [1, 'two', false, null],
      { nested: { deep: [1, 2, 3] } },
    ];

    expect(values).toHaveLength(6);
  });

  it('QueryParams accepts empty, flat and nested objects', () => {
    const empty: QueryParams = {};
    const params: QueryParams = {
      name: 'John',
      age: 30,
      active: true,
      data: null,
      tags: ['tag1', 'tag2'],
      nested: { key: 'value' },
    };

    expect(empty).toEqual({});
    expect(params.name).toBe('John');
    expect(params.nested).toEqual({ key: 'value' });
  });

  it('QueryOptions built from exported types is accepted by the query command', () => {
    const params: QueryParams = { name: 'test' };
    const options: QueryOptions = { params, TIMEOUT: 5000 };

    const args = pushQueryArguments([], 'g', 'RETURN $name', options);

    expect(args).toEqual(['g', 'CYPHER name="test" RETURN $name', 'TIMEOUT', '5000']);
  });

  it('QueryOptionsBackwardCompatible accepts a timeout number or an options object', () => {
    const asNumber: QueryOptionsBackwardCompatible = 5000;
    const asObject: QueryOptionsBackwardCompatible = { TIMEOUT: 5000 };

    expect(pushQueryArguments([], 'g', 'RETURN 1', asNumber)).toEqual(
      pushQueryArguments([], 'g', 'RETURN 1', asObject)
    );
  });
});
