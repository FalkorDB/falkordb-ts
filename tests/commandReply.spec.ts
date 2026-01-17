import { describe, it, expect } from '@jest/globals';
import * as SLOWLOG from '../src/commands/SLOWLOG';
import * as QUERY from '../src/commands/QUERY';

describe('Command Reply Transformations', () => {
  describe('SLOWLOG transformReply', () => {
    it('should transform single log entry', () => {
      const rawReply: any = [
        ['1640000000', 'GRAPH.QUERY', 'MATCH (n) RETURN n', '150.5']
      ];
      const result = SLOWLOG.transformReply(rawReply);
      
      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toEqual(new Date(1640000000 * 1000));
      expect(result[0].command).toBe('GRAPH.QUERY');
      expect(result[0].query).toBe('MATCH (n) RETURN n');
      expect(result[0].took).toBe(150.5);
    });

    it('should transform multiple log entries', () => {
      const rawReply: any = [
        ['1640000000', 'GRAPH.QUERY', 'MATCH (n) RETURN n', '150.5'],
        ['1640000100', 'GRAPH.QUERY', 'CREATE (n:Person)', '200.0'],
        ['1640000200', 'GRAPH.RO_QUERY', 'MATCH (n:User) RETURN n.name', '50.25']
      ];
      const result = SLOWLOG.transformReply(rawReply);
      
      expect(result).toHaveLength(3);
      
      expect(result[0].timestamp).toEqual(new Date(1640000000 * 1000));
      expect(result[0].command).toBe('GRAPH.QUERY');
      expect(result[0].query).toBe('MATCH (n) RETURN n');
      expect(result[0].took).toBe(150.5);
      
      expect(result[1].timestamp).toEqual(new Date(1640000100 * 1000));
      expect(result[1].command).toBe('GRAPH.QUERY');
      expect(result[1].query).toBe('CREATE (n:Person)');
      expect(result[1].took).toBe(200.0);
      
      expect(result[2].timestamp).toEqual(new Date(1640000200 * 1000));
      expect(result[2].command).toBe('GRAPH.RO_QUERY');
      expect(result[2].query).toBe('MATCH (n:User) RETURN n.name');
      expect(result[2].took).toBe(50.25);
    });

    it('should handle empty log', () => {
      const rawReply: any = [];
      const result = SLOWLOG.transformReply(rawReply);
      
      expect(result).toHaveLength(0);
    });

    it('should handle integer took value', () => {
      const rawReply: any = [
        ['1640000000', 'GRAPH.QUERY', 'MATCH (n) RETURN n', '100']
      ];
      const result = SLOWLOG.transformReply(rawReply);
      
      expect(result[0].took).toBe(100);
    });
  });

  describe('QUERY transformReply', () => {
    it('should transform reply with headers, data, and metadata', () => {
      const rawReply: any = [
        ['name', 'age'],
        [['Alice', 30], ['Bob', 25]],
        ['Query executed in 10ms']
      ];
      const result = QUERY.transformReply(rawReply);
      
      expect(result.headers).toEqual(['name', 'age']);
      expect(result.data).toEqual([['Alice', 30], ['Bob', 25]]);
      expect(result.metadata).toEqual(['Query executed in 10ms']);
    });

    it('should transform reply with only metadata (no results)', () => {
      const rawReply: any = [
        ['Query executed in 5ms']
      ];
      const result = QUERY.transformReply(rawReply);
      
      expect(result.headers).toBeUndefined();
      expect(result.data).toBeUndefined();
      expect(result.metadata).toEqual(['Query executed in 5ms']);
    });

    it('should handle empty data with headers', () => {
      const rawReply: any = [
        ['name'],
        [],
        ['No results']
      ];
      const result = QUERY.transformReply(rawReply);
      
      expect(result.headers).toEqual(['name']);
      expect(result.data).toEqual([]);
      expect(result.metadata).toEqual(['No results']);
    });
  });
});
