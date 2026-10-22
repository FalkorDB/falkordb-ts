import { describe, it, beforeAll, afterAll, expect } from '@jest/globals';
import * as QUERY from '../src/commands/QUERY';
import FalkorDB from '../src/falkordb';
import { client } from './dbConnection';
import type { QueryParam } from '../src/types';

const toCypher = (params: Record<string, unknown>): string =>
  QUERY.transformArguments('graph', 'RETURN 1', { params: params as never })[2] as string;

describe('Query Parameters', () => {
  describe('String Parameters', () => {
    it('should escape double quotes in string parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) WHERE n.name = $name RETURN n', {
        params: { name: 'John "The" Doe' }
      });
      expect(result[2]).toContain('`name`="John \\"The\\" Doe"');
    });

    it('should escape backslashes in string parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { path: 'C:\\Users\\Test' }
      });
      expect(result[2]).toContain('`path`="C:\\\\Users\\\\Test"');
    });

    it('should handle simple string parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { name: 'Alice' }
      });
      expect(result[2]).toBe('CYPHER `name`="Alice" MATCH (n) RETURN n');
    });
  });

  describe('Number Parameters', () => {
    it('should handle integer parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { age: 25 }
      });
      expect(result[2]).toBe('CYPHER `age`=25 MATCH (n) RETURN n');
    });

    it('should handle float parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { price: 19.99 }
      });
      expect(result[2]).toBe('CYPHER `price`=19.99 MATCH (n) RETURN n');
    });

    it('should handle zero', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { count: 0 }
      });
      expect(result[2]).toBe('CYPHER `count`=0 MATCH (n) RETURN n');
    });
  });

  describe('Boolean Parameters', () => {
    it('should handle true boolean', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { active: true }
      });
      expect(result[2]).toBe('CYPHER `active`=true MATCH (n) RETURN n');
    });

    it('should handle false boolean', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { deleted: false }
      });
      expect(result[2]).toBe('CYPHER `deleted`=false MATCH (n) RETURN n');
    });
  });

  describe('Null Parameters', () => {
    it('should handle null parameter', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { value: null }
      });
      expect(result[2]).toBe('CYPHER `value`=null MATCH (n) RETURN n');
    });
  });

  describe('Array Parameters', () => {
    it('should handle array of numbers', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { ids: [1, 2, 3] }
      });
      expect(result[2]).toBe('CYPHER `ids`=[1,2,3] MATCH (n) RETURN n');
    });

    it('should handle array of strings', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { names: ['Alice', 'Bob'] }
      });
      expect(result[2]).toBe('CYPHER `names`=["Alice","Bob"] MATCH (n) RETURN n');
    });

    it('should handle empty array', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { list: [] }
      });
      expect(result[2]).toBe('CYPHER `list`=[] MATCH (n) RETURN n');
    });

    it('should handle mixed array', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { mixed: [1, 'two', true, null] }
      });
      expect(result[2]).toBe('CYPHER `mixed`=[1,"two",true,null] MATCH (n) RETURN n');
    });

    it('should handle nested arrays', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { matrix: [[1, 2], [3, 4]] }
      });
      expect(result[2]).toBe('CYPHER `matrix`=[[1,2],[3,4]] MATCH (n) RETURN n');
    });
  });

  describe('Object Parameters', () => {
    it('should handle simple object', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { user: { name: 'Alice', age: 30 } }
      });
      expect(result[2]).toBe('CYPHER `user`={`name`:"Alice",`age`:30} MATCH (n) RETURN n');
    });

    it('should handle nested objects', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { person: { name: 'Bob', address: { city: 'NYC', zip: 10001 } } }
      });
      expect(result[2]).toBe('CYPHER `person`={`name`:"Bob",`address`:{`city`:"NYC",`zip`:10001}} MATCH (n) RETURN n');
    });

    it('should handle object with various types', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { data: { str: 'test', num: 42, bool: true, nil: null } }
      });
      expect(result[2]).toBe('CYPHER `data`={`str`:"test",`num`:42,`bool`:true,`nil`:null} MATCH (n) RETURN n');
    });

    it('should handle object with array', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { obj: { items: [1, 2, 3] } }
      });
      expect(result[2]).toBe('CYPHER `obj`={`items`:[1,2,3]} MATCH (n) RETURN n');
    });
  });

  describe('Multiple Parameters', () => {
    it('should handle multiple parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { name: 'Alice', age: 25, active: true }
      });
      expect(result[2]).toContain('CYPHER');
      expect(result[2]).toContain('`name`="Alice"');
      expect(result[2]).toContain('`age`=25');
      expect(result[2]).toContain('`active`=true');
    });
  });

  describe('Combined with TIMEOUT', () => {
    it('should handle params with TIMEOUT', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { name: 'Alice' },
        TIMEOUT: 5000
      });
      expect(result).toEqual([
        'GRAPH.QUERY',
        'graph',
        'CYPHER `name`="Alice" MATCH (n) RETURN n',
        'TIMEOUT',
        '5000'
      ]);
    });
  });

  describe('Identifier Escaping', () => {
    it('should wrap parameter names that are not bare identifiers in backticks', () => {
      expect(toCypher({ 'my-key': 1, '@type': 'x', '123e4567-e89b-12d3': true }))
        .toBe('CYPHER `my-key`=1 `@type`="x" `123e4567-e89b-12d3`=true RETURN 1');
    });

    it('should wrap nested map keys in backticks', () => {
      expect(toCypher({ m: { '@type': 'x', 'a-b': [1, { 'c d': null }] } }))
        .toBe('CYPHER `m`={`@type`:"x",`a-b`:[1,{`c d`:null}]} RETURN 1');
    });

    it('should reject an empty parameter name', () => {
      expect(() => toCypher({ '': 1 })).toThrow('Cypher parameter name cannot be empty');
    });

    it('should reject a parameter name containing a backtick', () => {
      expect(() => toCypher({ 'a`b': 1 })).toThrow('Cypher parameter name cannot contain a backtick: "a`b"');
    });

    it('should reject an empty map key', () => {
      expect(() => toCypher({ m: { '': 1 } })).toThrow('Cypher map key cannot be empty');
    });

    it('should reject a map key containing a backtick', () => {
      expect(() => toCypher({ m: { 'a`b': 1 } })).toThrow('Cypher map key cannot contain a backtick: "a`b"');
    });
  });

  describe('Numeric Edge Cases', () => {
    it.each([NaN, Infinity, -Infinity])('should reject the non-finite number %p', (value) => {
      expect(() => toCypher({ x: value })).toThrow(TypeError);
      expect(() => toCypher({ x: [1, { y: value }] })).toThrow('only finite numbers are supported');
    });

    it('should serialize bigint parameters', () => {
      expect(toCypher({ big: 9007199254740993n, neg: -5n, list: [1n] }))
        .toBe('CYPHER `big`=9007199254740993 `neg`=-5 `list`=[1] RETURN 1');
    });
  });

  describe('Typed Array Parameters', () => {
    it('should serialize typed arrays as lists', () => {
      expect(toCypher({
        f32: new Float32Array([0.5, -1.25]),
        i32: new Int32Array([1, 2]),
        big: new BigInt64Array([3n]),
        empty: new Float64Array(0),
      })).toBe('CYPHER `f32`=[0.5,-1.25] `i32`=[1,2] `big`=[3] `empty`=[] RETURN 1');
    });

    it('should reject non-finite values inside typed arrays', () => {
      expect(() => toCypher({ v: new Float32Array([1, NaN]) })).toThrow(TypeError);
    });
  });

  describe('Unsupported Values', () => {
    it.each([
      ['Date', new Date(0)],
      ['Map', new Map([['a', 1]])],
      ['Set', new Set([1])],
      ['RegExp', /a/],
      ['Promise', Promise.resolve(1)],
      ['ArrayBuffer', new ArrayBuffer(4)],
      ['DataView', new DataView(new ArrayBuffer(4))],
    ])('should reject a %s with a TypeError', (name, value) => {
      expect(() => toCypher({ x: value })).toThrow(new TypeError(
        `Unsupported param type ${name}: convert it to a supported value first`
      ));
      expect(() => toCypher({ x: { nested: [value] } })).toThrow(TypeError);
    });

    it.each([
      ['undefined', undefined],
      ['function', () => 1],
      ['symbol', Symbol('s')],
    ])('should reject a %s with a TypeError', (type, value) => {
      expect(() => toCypher({ x: value })).toThrow(new TypeError(`Unsupported param type ${type}`));
    });

    it('should keep serializing the own enumerable properties of class instances', () => {
      class Point {
        constructor(public x: number, public y: number) {}
      }
      expect(toCypher({ p: new Point(1, 2) as unknown as QueryParam }))
        .toBe('CYPHER `p`={`x`:1,`y`:2} RETURN 1');
    });
  });

  describe('Round Trip', () => {
    let clientInstance: FalkorDB;
    const graphName = `pr-params-${process.pid}-${Date.now()}`;

    beforeAll(async () => {
      clientInstance = await client();
    });

    afterAll(async () => {
      try {
        if ((await clientInstance.list()).includes(graphName)) {
          await clientInstance.selectGraph(graphName).delete();
        }
      } finally {
        await clientInstance.close();
      }
    });

    it('should send keys that need backticks, bigints and typed arrays to the server', async () => {
      const graph = clientInstance.selectGraph(graphName);
      const result = await graph.query<Record<string, unknown>>(
        'RETURN $`my-key` AS k, $`@type` AS t, $m AS m, $big AS big, $vec AS vec',
        {
          params: {
            'my-key': 1,
            '@type': 'thing',
            m: { '@type': 'x', 'a-b': [1, 2], '123e4567-e89b-12d3': { 'c d': true } },
            big: 9007199254740993n,
            vec: new Float32Array([0.5, -1.25, 2]),
          },
        }
      );

      expect(result.data?.[0]).toEqual({
        k: 1,
        t: 'thing',
        m: { '@type': 'x', 'a-b': [1, 2], '123e4567-e89b-12d3': { 'c d': true } },
        // The reply parser reads integers as JS numbers, so precision past 2^53 is lost
        big: 9007199254740992,
        vec: [0.5, -1.25, 2],
      });
    });

    it('should store and match on properties set from backticked map keys', async () => {
      const graph = clientInstance.selectGraph(graphName);
      await graph.query('CREATE (n:Item) SET n = $props', {
        params: { props: { kind: 'a', 'sku-id': 'X-1' } },
      });
      const result = await graph.query<{ sku: string }>(
        'MATCH (n:Item {`sku-id`: $`sku-id`}) RETURN n.`sku-id` AS sku',
        { params: { 'sku-id': 'X-1' } }
      );
      expect(result.data).toEqual([{ sku: 'X-1' }]);
    });
  });
});
