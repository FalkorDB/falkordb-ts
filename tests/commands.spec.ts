import { describe, it, expect } from '@jest/globals';
import * as UDF_LOAD from '../src/commands/UDF_LOAD';
import * as UDF_LIST from '../src/commands/UDF_LIST';
import * as UDF_DELETE from '../src/commands/UDF_DELETE';
import * as UDF_FLUSH from '../src/commands/UDF_FLUSH';
import * as INFO from '../src/commands/INFO';
import * as MEMORY_USAGE from '../src/commands/MEMORY_USAGE';
import * as SLOWLOG from '../src/commands/SLOWLOG';
import * as CONFIG_GET from '../src/commands/CONFIG_GET';
import * as CONFIG_SET from '../src/commands/CONFIG_SET';
import * as LIST from '../src/commands/LIST';
import * as DELETE from '../src/commands/DELETE';
import * as COPY from '../src/commands/COPY';
import * as EXPLAIN from '../src/commands/EXPLAIN';
import * as PROFILE from '../src/commands/PROFILE';
import * as QUERY from '../src/commands/QUERY';
import * as RO_QUERY from '../src/commands/RO_QUERY';
import * as CONSTRAINT_CREATE from '../src/commands/CONSTRAINT_CREATE';
import * as CONSTRAINT_DROP from '../src/commands/CONSTRAINT_DROP';
import { ConstraintType, EntityType } from '../src/commands/CONSTRAINT_CREATE';

describe('Command Transformation Functions', () => {
  describe('UDF_LOAD', () => {
    it('should transform arguments with string script and no replace flag', () => {
      const result = UDF_LOAD.transformArguments('mylib', 'function myFunc() { return 42; }', false);
      expect(result).toEqual([
        'GRAPH.UDF',
        'LOAD',
        'mylib',
        'function myFunc() { return 42; }'
      ]);
    });

    it('should transform arguments with string script and replace flag', () => {
      const result = UDF_LOAD.transformArguments('mylib', 'function myFunc() { return 42; }', true);
      expect(result).toEqual([
        'GRAPH.UDF',
        'LOAD',
        'REPLACE',
        'mylib',
        'function myFunc() { return 42; }'
      ]);
    });

    it('should transform arguments with function script', () => {
      function namedFunction() {
        return 42;
      }
      const result = UDF_LOAD.transformArguments('mylib', namedFunction, false);
      expect(result).toHaveLength(4);
      expect(result[0]).toBe('GRAPH.UDF');
      expect(result[1]).toBe('LOAD');
      expect(result[2]).toBe('mylib');
      expect(result[3]).toContain('function namedFunction()');
      expect(result[3]).toContain('falkor.register("namedFunction", namedFunction)');
    });

    it('should transform arguments with function script and replace flag', () => {
      function anotherFunc() {
        return 100;
      }
      const result = UDF_LOAD.transformArguments('testlib', anotherFunc, true);
      expect(result).toHaveLength(5);
      expect(result[0]).toBe('GRAPH.UDF');
      expect(result[1]).toBe('LOAD');
      expect(result[2]).toBe('REPLACE');
      expect(result[3]).toBe('testlib');
      expect(result[4]).toContain('function anotherFunc()');
      expect(result[4]).toContain('falkor.register("anotherFunc", anotherFunc)');
    });

    it('should handle unnamed function (gets variable name)', () => {
      const unnamedFunc = function() {
        return 42;
      };
      // In JavaScript, even "unnamed" functions get assigned the variable name
      const result = UDF_LOAD.transformArguments('mylib', unnamedFunc, false);
      expect(result).toHaveLength(4);
      expect(result[3]).toContain('unnamedFunc');
    });

    it('should handle arrow function (gets variable name)', () => {
      const arrowFunc = () => 42;
      // Arrow functions also get assigned the variable name
      const result = UDF_LOAD.transformArguments('mylib', arrowFunc, false);
      expect(result).toHaveLength(4);
      expect(result[3]).toContain('arrowFunc');
    });
  });

  describe('UDF_DELETE', () => {
    it('should transform arguments with library name', () => {
      const result = UDF_DELETE.transformArguments('mylib');
      expect(result).toEqual(['GRAPH.UDF', 'DELETE', 'mylib']);
    });

    it('should transform arguments with different library name', () => {
      const result = UDF_DELETE.transformArguments('testlib');
      expect(result).toEqual(['GRAPH.UDF', 'DELETE', 'testlib']);
    });
  });

  describe('UDF_FLUSH', () => {
    it('should transform arguments', () => {
      const result = UDF_FLUSH.transformArguments();
      expect(result).toEqual(['GRAPH.UDF', 'FLUSH']);
    });
  });

  describe('UDF_LIST', () => {
    it('should transform arguments with no parameters', () => {
      const result = UDF_LIST.transformArguments();
      expect(result).toEqual(['GRAPH.UDF', 'LIST']);
    });

    it('should transform arguments with library name', () => {
      const result = UDF_LIST.transformArguments('mylib');
      expect(result).toEqual(['GRAPH.UDF', 'LIST', 'mylib']);
    });

    it('should transform arguments with withCode flag', () => {
      const result = UDF_LIST.transformArguments(undefined, true);
      expect(result).toEqual(['GRAPH.UDF', 'LIST', 'WITHCODE']);
    });

    it('should transform arguments with library name and withCode flag', () => {
      const result = UDF_LIST.transformArguments('testlib', true);
      expect(result).toEqual(['GRAPH.UDF', 'LIST', 'testlib', 'WITHCODE']);
    });

    it('should transform arguments with library name and withCode false', () => {
      const result = UDF_LIST.transformArguments('testlib', false);
      expect(result).toEqual(['GRAPH.UDF', 'LIST', 'testlib']);
    });
  });

  describe('INFO', () => {
    it('should transform arguments with no section', () => {
      const result = INFO.transformArguments();
      expect(result).toEqual(['GRAPH.INFO']);
    });

    it('should transform arguments with section', () => {
      const result = INFO.transformArguments('NODES');
      expect(result).toEqual(['GRAPH.INFO', 'NODES']);
    });

    it('should transform arguments with different section', () => {
      const result = INFO.transformArguments('EDGES');
      expect(result).toEqual(['GRAPH.INFO', 'EDGES']);
    });
  });

  describe('MEMORY_USAGE', () => {
    it('should transform arguments with no options', () => {
      const result = MEMORY_USAGE.transformArguments('mygraph');
      expect(result).toEqual(['GRAPH.MEMORY', 'USAGE', 'mygraph']);
    });

    it('should transform arguments with SAMPLES option', () => {
      const result = MEMORY_USAGE.transformArguments('mygraph', { SAMPLES: 10 });
      expect(result).toEqual(['GRAPH.MEMORY', 'USAGE', 'mygraph', '10']);
    });

    it('should transform arguments without SAMPLES option', () => {
      const result = MEMORY_USAGE.transformArguments('mygraph', {});
      expect(result).toEqual(['GRAPH.MEMORY', 'USAGE', 'mygraph']);
    });
  });

  describe('SLOWLOG', () => {
    it('should transform arguments with graph name only', () => {
      const result = SLOWLOG.transformArguments('mygraph');
      expect(result).toEqual(['GRAPH.SLOWLOG', 'mygraph']);
    });
  });

  describe('CONFIG_GET', () => {
    it('should transform arguments with config name', () => {
      const result = CONFIG_GET.transformArguments('RESULTSET_SIZE');
      expect(result).toEqual(['GRAPH.CONFIG', 'GET', 'RESULTSET_SIZE']);
    });

    it('should transform arguments with different config name', () => {
      const result = CONFIG_GET.transformArguments('TIMEOUT_MAX');
      expect(result).toEqual(['GRAPH.CONFIG', 'GET', 'TIMEOUT_MAX']);
    });
  });

  describe('CONFIG_SET', () => {
    it('should transform arguments with config name and value', () => {
      const result = CONFIG_SET.transformArguments('RESULTSET_SIZE', 1000);
      expect(result).toEqual(['GRAPH.CONFIG', 'SET', 'RESULTSET_SIZE', '1000']);
    });

    it('should transform arguments with string value', () => {
      const result = CONFIG_SET.transformArguments('TIMEOUT_MAX', '5000');
      expect(result).toEqual(['GRAPH.CONFIG', 'SET', 'TIMEOUT_MAX', '5000']);
    });
  });

  describe('LIST', () => {
    it('should transform arguments', () => {
      const result = LIST.transformArguments();
      expect(result).toEqual(['GRAPH.LIST']);
    });
  });

  describe('DELETE', () => {
    it('should transform arguments with graph name', () => {
      const result = DELETE.transformArguments('mygraph');
      expect(result).toEqual(['GRAPH.DELETE', 'mygraph']);
    });

    it('should transform arguments with different graph name', () => {
      const result = DELETE.transformArguments('testgraph');
      expect(result).toEqual(['GRAPH.DELETE', 'testgraph']);
    });
  });

  describe('COPY', () => {
    it('should transform arguments with source and destination', () => {
      const result = COPY.transformArguments('source', 'destination');
      expect(result).toEqual(['GRAPH.COPY', 'source', 'destination']);
    });
  });

  describe('EXPLAIN', () => {
    it('should transform arguments with graph name and query', () => {
      const result = EXPLAIN.transformArguments('mygraph', 'MATCH (n) RETURN n');
      expect(result).toEqual(['GRAPH.EXPLAIN', 'mygraph', 'MATCH (n) RETURN n']);
    });

    it('should transform arguments with different query', () => {
      const result = EXPLAIN.transformArguments('testgraph', 'CREATE (n:Person)');
      expect(result).toEqual(['GRAPH.EXPLAIN', 'testgraph', 'CREATE (n:Person)']);
    });
  });

  describe('PROFILE', () => {
    it('should transform arguments with graph name and query', () => {
      const result = PROFILE.transformArguments('mygraph', 'MATCH (n) RETURN n');
      expect(result).toEqual(['GRAPH.PROFILE', 'mygraph', 'MATCH (n) RETURN n']);
    });

    it('should transform arguments with different query', () => {
      const result = PROFILE.transformArguments('testgraph', 'MATCH (n:Person) RETURN n.name');
      expect(result).toEqual(['GRAPH.PROFILE', 'testgraph', 'MATCH (n:Person) RETURN n.name']);
    });
  });

  describe('QUERY', () => {
    it('should transform arguments with graph name and query', () => {
      const result = QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n');
      expect(result).toEqual(['GRAPH.QUERY', 'mygraph', 'MATCH (n) RETURN n']);
    });

    it('should transform arguments with TIMEOUT option', () => {
      const result = QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n', { TIMEOUT: 5000 });
      expect(result).toEqual(['GRAPH.QUERY', 'mygraph', 'MATCH (n) RETURN n', 'TIMEOUT', '5000']);
    });

    it('should transform arguments with params option', () => {
      const result = QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n', { params: { name: 'John' } });
      expect(result).toEqual(['GRAPH.QUERY', 'mygraph', 'CYPHER name="John" MATCH (n) RETURN n']);
    });

    it('should transform arguments with number (backward compatible)', () => {
      const result = QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n', 3000);
      expect(result).toEqual(['GRAPH.QUERY', 'mygraph', 'MATCH (n) RETURN n', 'TIMEOUT', '3000']);
    });

    it('should transform arguments without options', () => {
      const result = QUERY.transformArguments('testgraph', 'CREATE (n:Test)');
      expect(result).toEqual(['GRAPH.QUERY', 'testgraph', 'CREATE (n:Test)']);
    });

    it('should transform arguments with compact flag', () => {
      const result = QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n', undefined, true);
      expect(result).toEqual(['GRAPH.QUERY', 'mygraph', 'MATCH (n) RETURN n', '--compact']);
    });
  });

  describe('RO_QUERY', () => {
    it('should transform arguments with graph name and query', () => {
      const result = RO_QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n');
      expect(result).toEqual(['GRAPH.RO_QUERY', 'mygraph', 'MATCH (n) RETURN n']);
    });

    it('should transform arguments with TIMEOUT option', () => {
      const result = RO_QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n', { TIMEOUT: 5000 });
      expect(result).toEqual(['GRAPH.RO_QUERY', 'mygraph', 'MATCH (n) RETURN n', 'TIMEOUT', '5000']);
    });

    it('should transform arguments with params option', () => {
      const result = RO_QUERY.transformArguments('testgraph', 'MATCH (n) RETURN n', { params: { id: 123 } });
      expect(result).toEqual(['GRAPH.RO_QUERY', 'testgraph', 'CYPHER id=123 MATCH (n) RETURN n']);
    });

    it('should transform arguments without options', () => {
      const result = RO_QUERY.transformArguments('graph1', 'MATCH (n) RETURN count(n)');
      expect(result).toEqual(['GRAPH.RO_QUERY', 'graph1', 'MATCH (n) RETURN count(n)']);
    });

    it('should transform arguments with compact flag', () => {
      const result = RO_QUERY.transformArguments('mygraph', 'MATCH (n) RETURN n', undefined, true);
      expect(result).toEqual(['GRAPH.RO_QUERY', 'mygraph', 'MATCH (n) RETURN n', '--compact']);
    });
  });

  describe('CONSTRAINT_CREATE', () => {
    it('should transform arguments for unique node constraint', () => {
      const result = CONSTRAINT_CREATE.transformArguments(
        'mygraph',
        ConstraintType.UNIQUE,
        EntityType.NODE,
        'Person',
        'id'
      );
      expect(result).toEqual([
        'GRAPH.CONSTRAINT', 'CREATE',
        'mygraph', 'UNIQUE', 'NODE', 'Person',
        'PROPERTIES', '1', 'id'
      ]);
    });

    it('should transform arguments for mandatory relationship constraint', () => {
      const result = CONSTRAINT_CREATE.transformArguments(
        'mygraph',
        ConstraintType.MANDATORY,
        EntityType.RELATIONSHIP,
        'KNOWS',
        'since'
      );
      expect(result).toEqual([
        'GRAPH.CONSTRAINT', 'CREATE',
        'mygraph', 'MANDATORY', 'RELATIONSHIP', 'KNOWS',
        'PROPERTIES', '1', 'since'
      ]);
    });

    it('should transform arguments with multiple properties', () => {
      const result = CONSTRAINT_CREATE.transformArguments(
        'testgraph',
        ConstraintType.UNIQUE,
        EntityType.NODE,
        'User',
        'email',
        'username'
      );
      expect(result).toEqual([
        'GRAPH.CONSTRAINT', 'CREATE',
        'testgraph', 'UNIQUE', 'NODE', 'User',
        'PROPERTIES', '2', 'email', 'username'
      ]);
    });
  });

  describe('CONSTRAINT_DROP', () => {
    it('should transform arguments for unique node constraint', () => {
      const result = CONSTRAINT_DROP.transformArguments(
        'mygraph',
        ConstraintType.UNIQUE,
        EntityType.NODE,
        'Person',
        'id'
      );
      expect(result).toEqual([
        'GRAPH.CONSTRAINT', 'DROP',
        'mygraph', 'UNIQUE', 'NODE', 'Person',
        'PROPERTIES', '1', 'id'
      ]);
    });

    it('should transform arguments for mandatory relationship constraint', () => {
      const result = CONSTRAINT_DROP.transformArguments(
        'mygraph',
        ConstraintType.MANDATORY,
        EntityType.RELATIONSHIP,
        'FOLLOWS',
        'timestamp'
      );
      expect(result).toEqual([
        'GRAPH.CONSTRAINT', 'DROP',
        'mygraph', 'MANDATORY', 'RELATIONSHIP', 'FOLLOWS',
        'PROPERTIES', '1', 'timestamp'
      ]);
    });

    it('should transform arguments with multiple properties', () => {
      const result = CONSTRAINT_DROP.transformArguments(
        'testgraph',
        ConstraintType.UNIQUE,
        EntityType.NODE,
        'Product',
        'sku',
        'barcode'
      );
      expect(result).toEqual([
        'GRAPH.CONSTRAINT', 'DROP',
        'testgraph', 'UNIQUE', 'NODE', 'Product',
        'PROPERTIES', '2', 'sku', 'barcode'
      ]);
    });
  });
});
