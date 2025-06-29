import { strict as assert } from 'assert';
import { pushQueryArguments } from '.';

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

    it('empty params object', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {}
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER  query']
      );
    });

    it('nested arrays', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            nested: [1, [2, 3], 4]
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER nested=[1,[2,3],4] query']
      );
    });

    it('nested objects', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            nested: {a: 1, b: {c: 2}}
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER nested={a:1,b:{c:2}} query']
      );
    });

    it('string with special characters', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            message: 'He said "Hello\\World"'
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER message="He said \\"Hello\\\\World\\"" query']
      );
    });

    it('mixed data types in array', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            mixed: [1, 'hello', true, null, {key: 'value'}]
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER mixed=[1,"hello",true,null,{key:"value"}] query']
      );
    });

    it('deeply nested structure', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            complex: {
              user: { 
                name: 'John', 
                details: { age: 30, active: true },
                tags: ['admin', 'user']
              }
            }
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER complex={user:{name:"John",details:{age:30,active:true},tags:["admin","user"]}} query']
      );
    });

    it('boolean values', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            isActive: true,
            isDeleted: false
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER isActive=true isDeleted=false query']
      );
    });

    it('numeric values', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            age: 30,
            price: 99.99,
            negative: -5
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER age=30 price=99.99 negative=-5 query']
      );
    });

    it('empty arrays and objects', () => {
      assert.deepEqual(
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            emptyArray: [],
            emptyObject: {}
          }
        }),
        ['GRAPH.QUERY', 'graph', 'CYPHER emptyArray=[] emptyObject={} query']
      );
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

  it('TIMEOUT with zero value', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
        TIMEOUT: 0
      }),
      ['GRAPH.QUERY', 'graph', 'query', 'TIMEOUT', '0']
    );
  });

  it('TIMEOUT with large value', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
        TIMEOUT: 999999
      }),
      ['GRAPH.QUERY', 'graph', 'query', 'TIMEOUT', '999999']
    );
  });

  it('compact', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', undefined, true),
      ['GRAPH.QUERY', 'graph', 'query', '--compact']
    );
  });

  it('params with TIMEOUT and compact', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
        params: { name: 'test' },
        TIMEOUT: 5
      }, true),
      ['GRAPH.QUERY', 'graph', 'CYPHER name="test" query', 'TIMEOUT', '5', '--compact']
    );
  });

  it('no options provided', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query'),
      ['GRAPH.QUERY', 'graph', 'query']
    );
  });

  it('only compact flag', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', undefined, true),
      ['GRAPH.QUERY', 'graph', 'query', '--compact']
    );
  });

  it('TIMEOUT undefined should not add timeout', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
        TIMEOUT: undefined
      }),
      ['GRAPH.QUERY', 'graph', 'query']
    );
  });

  it('params and compact without TIMEOUT', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
        params: { name: 'test' }
      }, true),
      ['GRAPH.QUERY', 'graph', 'CYPHER name="test" query', '--compact']
    );
  });

  it('backward compatible timeout with compact', () => {
    assert.deepEqual(
      pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', 10, true),
      ['GRAPH.QUERY', 'graph', 'query', 'TIMEOUT', '10', '--compact']
    );
  });

  describe('error handling', () => {
    it('should throw TypeError for symbol in params', () => {
      assert.throws(() => {
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            invalidType: Symbol('test') as any
          }
        });
      }, TypeError);
    });

    it('should throw TypeError for function in params', () => {
      assert.throws(() => {
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            // @ts-ignore
            invalidType: () => {}
          }
        });
      }, TypeError);
    });

    it('should throw TypeError for undefined in params', () => {
      assert.throws(() => {
        pushQueryArguments(['GRAPH.QUERY'], 'graph', 'query', {
          params: {
            invalidType: undefined as any
          }
        });
      }, TypeError);
    });
  });
});
