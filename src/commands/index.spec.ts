import { strict as assert } from 'assert';
import { pushQueryArguments } from '.';

/**
 * Pushes query arguments onto an array for a graph query operation.
 * @param {string[]} initialArray - The initial array to push arguments onto, typically containing the command.
 * @param {string} graph - The name of the graph to query.
 * @param {string} query - The query string to execute.
 * @param {Object|number} [options] - Optional parameters or timeout value.
 * @param {Object} [options.params] - Key-value pairs of query parameters.
 * @param {number} [options.TIMEOUT] - Timeout value in milliseconds.
 * @param {boolean} [compact] - If true, adds the '--compact' flag to the query.
 * @returns {string[]} An array of arguments ready for execution.
 * @throws {TypeError} If an invalid parameter type is provided in options.params.
 */
describe('pushQueryArguments', () => {
  it('simple', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query'),
      ['GRAPH.QUERY', 'graph', 'query']
    );
  });

  describe('params', () => {
    it('all types', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            null: null,
            string: '"\\',
            number: 0,
            boolean: false,
            array: [0],
            object: {a: 0}
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER null=null string="\\"\\\\" number=0 boolean=false array=[0] object={a:0} query']
      );
    });

    it('TypeError', () => {
      assert.throws(() => {
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            a: undefined as any
          }
        })
      }, TypeError);
    });
  });

  it('TIMEOUT backward compatible', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', 1),
      ['GRAPH.QUERY', 'graph', 'query', 'TIMEOUT', '1']
    );
  });

  it('TIMEOUT', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
        TIMEOUT: 1
      }),
      ['GRAPH.QUERY', 'graph', 'query', 'TIMEOUT', '1']
    );
  });

  it('compact', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', undefined, true),
      ['GRAPH.QUERY', 'graph', 'query', '--compact']
    );
  });
});
