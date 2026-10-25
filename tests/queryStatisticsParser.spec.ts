import { describe, it, expect } from '@jest/globals';
import { parseQueryStatistics } from '../src/query-statistics';
import type { QueryStatistics } from '../index';

const EMPTY: QueryStatistics = {
  labelsAdded: 0,
  labelsRemoved: 0,
  nodesCreated: 0,
  nodesDeleted: 0,
  propertiesSet: 0,
  propertiesRemoved: 0,
  relationshipsCreated: 0,
  relationshipsDeleted: 0,
  indicesCreated: 0,
  indicesDeleted: 0,
  constraintsCreated: 0,
  constraintsDeleted: 0,
  cachedExecution: false,
  queryInternalExecutionTime: 0,
};

describe('parseQueryStatistics', () => {
  it('defaults every statistic when there are no lines', () => {
    expect(parseQueryStatistics([])).toEqual(EMPTY);
    expect(parseQueryStatistics()).toEqual(EMPTY);
  });

  it('parses every statistic the server emits', () => {
    expect(parseQueryStatistics([
      'Labels added: 1',
      'Labels removed: 2',
      'Nodes created: 3',
      'Properties set: 4',
      'Properties removed: 5',
      'Relationships created: 6',
      'Nodes deleted: 7',
      'Relationships deleted: 8',
      'Indices created: 9',
      'Indices deleted: 10',
      'Constraints created: 11',
      'Constraints deleted: 12',
      'Cached execution: 1',
      'Query internal execution time: 0.123456 milliseconds',
    ])).toEqual({
      labelsAdded: 1,
      labelsRemoved: 2,
      nodesCreated: 3,
      propertiesSet: 4,
      propertiesRemoved: 5,
      relationshipsCreated: 6,
      nodesDeleted: 7,
      relationshipsDeleted: 8,
      indicesCreated: 9,
      indicesDeleted: 10,
      constraintsCreated: 11,
      constraintsDeleted: 12,
      cachedExecution: true,
      queryInternalExecutionTime: 0.123456,
    });
  });

  it('reads cached execution 0 as false', () => {
    expect(parseQueryStatistics(['Cached execution: 0']).cachedExecution).toBe(false);
  });

  it('keeps defaults for absent counters', () => {
    expect(parseQueryStatistics(['Nodes created: 2'])).toEqual({ ...EMPTY, nodesCreated: 2 });
  });

  it('ignores unknown and malformed lines', () => {
    expect(parseQueryStatistics([
      'Something new: 5',
      'no separator here',
      'Nodes created: many',
      'Nodes deleted:',
      'Labels added: 1garbage',
      'Properties set: 2 3',
      'Indices created: -1',
      'Query internal execution time: 0.5 seconds',
      ': 3',
      '',
      'toString: 1',
      '__proto__: 1',
    ])).toEqual(EMPTY);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseQueryStatistics([
      '  Nodes created :  4 ',
      'Query internal execution time:12 milliseconds',
    ])).toEqual({ ...EMPTY, nodesCreated: 4, queryInternalExecutionTime: 12 });
  });

  it('lets a repeated line override an earlier one', () => {
    expect(parseQueryStatistics(['Nodes created: 1', 'Nodes created: 2']).nodesCreated).toBe(2);
  });
});
