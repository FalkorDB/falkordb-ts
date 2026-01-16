import { describe, it, expect } from '@jest/globals';
import * as QUERY from '../src/commands/QUERY';

describe('Query Parameters', () => {
  describe('String Parameters', () => {
    it('should escape double quotes in string parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) WHERE n.name = $name RETURN n', {
        params: { name: 'John "The" Doe' }
      });
      expect(result[2]).toContain('name="John \\"The\\" Doe"');
    });

    it('should escape backslashes in string parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { path: 'C:\\Users\\Test' }
      });
      expect(result[2]).toContain('path="C:\\\\Users\\\\Test"');
    });

    it('should handle simple string parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { name: 'Alice' }
      });
      expect(result[2]).toBe('CYPHER name="Alice" MATCH (n) RETURN n');
    });
  });

  describe('Number Parameters', () => {
    it('should handle integer parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { age: 25 }
      });
      expect(result[2]).toBe('CYPHER age=25 MATCH (n) RETURN n');
    });

    it('should handle float parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { price: 19.99 }
      });
      expect(result[2]).toBe('CYPHER price=19.99 MATCH (n) RETURN n');
    });

    it('should handle zero', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { count: 0 }
      });
      expect(result[2]).toBe('CYPHER count=0 MATCH (n) RETURN n');
    });
  });

  describe('Boolean Parameters', () => {
    it('should handle true boolean', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { active: true }
      });
      expect(result[2]).toBe('CYPHER active=true MATCH (n) RETURN n');
    });

    it('should handle false boolean', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { deleted: false }
      });
      expect(result[2]).toBe('CYPHER deleted=false MATCH (n) RETURN n');
    });
  });

  describe('Null Parameters', () => {
    it('should handle null parameter', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { value: null }
      });
      expect(result[2]).toBe('CYPHER value=null MATCH (n) RETURN n');
    });
  });

  describe('Array Parameters', () => {
    it('should handle array of numbers', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { ids: [1, 2, 3] }
      });
      expect(result[2]).toBe('CYPHER ids=[1,2,3] MATCH (n) RETURN n');
    });

    it('should handle array of strings', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { names: ['Alice', 'Bob'] }
      });
      expect(result[2]).toBe('CYPHER names=["Alice","Bob"] MATCH (n) RETURN n');
    });

    it('should handle empty array', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { list: [] }
      });
      expect(result[2]).toBe('CYPHER list=[] MATCH (n) RETURN n');
    });

    it('should handle mixed array', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { mixed: [1, 'two', true, null] }
      });
      expect(result[2]).toBe('CYPHER mixed=[1,"two",true,null] MATCH (n) RETURN n');
    });

    it('should handle nested arrays', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { matrix: [[1, 2], [3, 4]] }
      });
      expect(result[2]).toBe('CYPHER matrix=[[1,2],[3,4]] MATCH (n) RETURN n');
    });
  });

  describe('Object Parameters', () => {
    it('should handle simple object', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { user: { name: 'Alice', age: 30 } }
      });
      expect(result[2]).toBe('CYPHER user={name:"Alice",age:30} MATCH (n) RETURN n');
    });

    it('should handle nested objects', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { person: { name: 'Bob', address: { city: 'NYC', zip: 10001 } } }
      });
      expect(result[2]).toBe('CYPHER person={name:"Bob",address:{city:"NYC",zip:10001}} MATCH (n) RETURN n');
    });

    it('should handle object with various types', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { data: { str: 'test', num: 42, bool: true, nil: null } }
      });
      expect(result[2]).toBe('CYPHER data={str:"test",num:42,bool:true,nil:null} MATCH (n) RETURN n');
    });

    it('should handle object with array', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { obj: { items: [1, 2, 3] } }
      });
      expect(result[2]).toBe('CYPHER obj={items:[1,2,3]} MATCH (n) RETURN n');
    });
  });

  describe('Multiple Parameters', () => {
    it('should handle multiple parameters', () => {
      const result = QUERY.transformArguments('graph', 'MATCH (n) RETURN n', {
        params: { name: 'Alice', age: 25, active: true }
      });
      expect(result[2]).toContain('CYPHER');
      expect(result[2]).toContain('name="Alice"');
      expect(result[2]).toContain('age=25');
      expect(result[2]).toContain('active=true');
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
        'CYPHER name="Alice" MATCH (n) RETURN n',
        'TIMEOUT',
        '5000'
      ]);
    });
  });
});
