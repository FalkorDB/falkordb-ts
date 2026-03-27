/**
 * Test to verify that QueryParam and QueryParams types are properly exported
 */
import type { QueryParam, QueryParams } from '../index';

describe('Exported Types', () => {
    test('QueryParams type can be used', () => {
        const params: QueryParams = {
            name: 'John',
            age: 30,
            active: true,
            data: null,
            tags: ['tag1', 'tag2'],
            nested: {
                key: 'value'
            }
        };

        expect(params).toBeDefined();
        expect(params.name).toBe('John');
        expect(params.age).toBe(30);
    });

    test('QueryParam type can be used for individual parameters', () => {
        const stringParam: QueryParam = 'test';
        const numberParam: QueryParam = 42;
        const booleanParam: QueryParam = true;
        const nullParam: QueryParam = null;
        const arrayParam: QueryParam = [1, 2, 3];
        const objectParam: QueryParam = { key: 'value' };

        expect(stringParam).toBe('test');
        expect(numberParam).toBe(42);
        expect(booleanParam).toBe(true);
        expect(nullParam).toBeNull();
        expect(arrayParam).toEqual([1, 2, 3]);
        expect(objectParam).toEqual({ key: 'value' });
    });
});
