import { jest, describe, it, expect, afterEach } from '@jest/globals';
import Graph from '../src/graph';
import type { Client } from '../src/clients/client';
import { GraphValueTypes } from '../src/enums';

// A client whose query reply carries the given compact values in one row
function graphReplying(values: Array<unknown>): Graph {
  const reply = {
    headers: values.map((_, i) => [1, `c${i}`]),
    data: [values],
    metadata: [],
  };
  const client = { query: async () => reply } as unknown as Client;
  return new Graph(client, 'unknown-value-type');
}

describe('Unknown value types', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should read a value of an unknown type as null instead of failing the query', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const graph = graphReplying([
      [GraphValueTypes.UNKNOWN, 'x'],
      [GraphValueTypes.INTEGER, 1],
      [GraphValueTypes.ARRAY, [[99, 'future'], [GraphValueTypes.STRING, 'a']]],
    ]);

    const result = await graph.query('RETURN 1');

    expect(result.data).toEqual([{ c0: null, c1: 1, c2: [null, 'a'] }]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('FalkorDB: unknown value type 0 in reply, returning null');
    expect(warn).toHaveBeenCalledWith('FalkorDB: unknown value type 99 in reply, returning null');
  });

  it('should warn only once per unknown type', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const graph = graphReplying([[100, 'a'], [100, 'b'], [GraphValueTypes.ARRAY, [[100, 'c']]]]);

    await graph.query('RETURN 1');
    const result = await graph.query('RETURN 1');

    expect(result.data).toEqual([{ c0: null, c1: null, c2: [null] }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('FalkorDB: unknown value type 100 in reply, returning null');
  });
});
