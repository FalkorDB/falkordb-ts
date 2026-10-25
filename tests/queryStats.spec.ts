import { describe, it, beforeAll, afterAll, afterEach, expect } from '@jest/globals';
import FalkorDB from '../src/falkordb';
import type Graph from '../src/graph';
import { client } from './dbConnection';

function getRandomNumber(): number {
  return Math.floor(Math.random() * 999999);
}

describe('Query statistics and headers', () => {
  let clientInstance: FalkorDB;
  const created: Graph[] = [];

  // Graphs used here are prefixed so they never collide with other suites
  function newGraph(): Graph {
    const graph = clientInstance.selectGraph(`pr-stats-${getRandomNumber()}`);
    created.push(graph);
    return graph;
  }

  beforeAll(async () => {
    clientInstance = await client();
  });

  afterEach(async () => {
    for (const graph of created.splice(0)) {
      await graph.delete().catch(() => undefined);
    }
  });

  afterAll(async () => {
    await clientInstance.close();
  });

  it('reports created nodes, relationships, labels and properties', async () => {
    const graph = newGraph();
    const result = await graph.query(
      "CREATE (a:Person:Admin {name: 'Alice', age: 30})-[:KNOWS {since: 2020}]->(b:Company {name: 'Acme'}) RETURN a.name AS name"
    );

    expect(result.stats).toMatchObject({
      nodesCreated: 2,
      relationshipsCreated: 1,
      // Each label is used once: servers differ on whether a label repeated
      // across new nodes counts once or per node
      labelsAdded: 3,
      propertiesSet: 4,
      nodesDeleted: 0,
      relationshipsDeleted: 0,
    });
    expect(result.data).toEqual([{ name: 'Alice' }]);
    expect(Object.keys(result).sort()).toEqual(['data', 'headers', 'stats']);
    expect(result).not.toHaveProperty('metadata');
  });

  it('reports set, removed and deleted counts', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice', age: 30})-[:KNOWS]->(:Person {name: 'Bob'})");

    const set = await graph.query("MATCH (n:Person {name: 'Alice'}) SET n.age = 31, n.city = 'Paris', n:Admin");
    expect(set.stats).toMatchObject({ propertiesSet: 2, labelsAdded: 1 });

    const removed = await graph.query("MATCH (n:Person {name: 'Alice'}) REMOVE n.city, n:Admin");
    expect(removed.stats).toMatchObject({ propertiesRemoved: 1, labelsRemoved: 1 });

    const deleted = await graph.query('MATCH (n:Person) DETACH DELETE n');
    expect(deleted.stats).toMatchObject({ nodesDeleted: 2, relationshipsDeleted: 1, nodesCreated: 0 });
  });

  it('reports index creation and deletion', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice'})");

    const createdIndex = await graph.query('CREATE INDEX FOR (p:Person) ON (p.name)');
    expect(createdIndex.stats.indicesCreated).toBe(1);

    const droppedIndex = await graph.query('DROP INDEX FOR (p:Person) ON (p.name)');
    expect(droppedIndex.stats.indicesDeleted).toBe(1);
  });

  it('reports cached execution and execution time', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice'})");
    const query = 'MATCH (n:Person) RETURN n.name';

    const first = await graph.query(query);
    expect(first.stats.cachedExecution).toBe(false);
    expect(typeof first.stats.queryInternalExecutionTime).toBe('number');
    expect(first.stats.queryInternalExecutionTime).toBeGreaterThan(0);

    const second = await graph.query(query);
    expect(second.stats.cachedExecution).toBe(true);
  });

  it('exposes the column names in order', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice', age: 30})");

    const result = await graph.query('MATCH (n:Person) RETURN n.age AS age, n.name AS name, n');
    expect(result.headers).toEqual(['age', 'name', 'n']);

    const empty = await graph.query("MATCH (n:Person {name: 'Nobody'}) RETURN n.name AS name, 1 AS one");
    expect(empty.headers).toEqual(['name', 'one']);
    expect(empty.data).toEqual([]);
  });

  it('adds statistics and headers to roQuery replies', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice'})");

    const result = await graph.roQuery('MATCH (n:Person) RETURN n.name AS name');
    expect(result.headers).toEqual(['name']);
    expect(result.data).toEqual([{ name: 'Alice' }]);
    expect(result.stats.nodesCreated).toBe(0);
    expect(result.stats.queryInternalExecutionTime).toBeGreaterThan(0);
  });

  it('replies to a write without RETURN with only statistics', async () => {
    const graph = newGraph();
    const result = await graph.query("CREATE (:Person {name: 'Alice'})");

    expect(result.stats).toMatchObject({ nodesCreated: 1, labelsAdded: 1, propertiesSet: 1 });
    expect(result.headers).toBeUndefined();
    expect(result.data).toBeUndefined();
    expect(Object.keys(result)).toEqual(['stats']);
    expect(result).not.toHaveProperty('metadata');
  });

  it('does not expose raw metadata on roQuery replies', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice'})");

    const result = await graph.roQuery('MATCH (n:Person) RETURN count(n) AS count');
    expect(result).not.toHaveProperty('metadata');
    expect(result.data).toEqual([{ count: 1 }]);
  });

  it('replies to the index helpers with statistics', async () => {
    const graph = newGraph();
    await graph.query("CREATE (:Person {name: 'Alice'})-[:KNOWS {since: 2020}]->(:Person {name: 'Bob'})");

    const replies = [
      [await graph.createNodeRangeIndex('Person', 'name'), 'indicesCreated'],
      [await graph.createNodeFulltextIndex('Person', 'bio'), 'indicesCreated'],
      [await graph.createNodeVectorIndex('Person', 3, 'euclidean', 'embedding'), 'indicesCreated'],
      [await graph.createEdgeRangeIndex('KNOWS', 'since'), 'indicesCreated'],
      [await graph.dropNodeRangeIndex('Person', 'name'), 'indicesDeleted'],
      [await graph.dropNodeFulltextIndex('Person', 'bio'), 'indicesDeleted'],
      [await graph.dropNodeVectorIndex('Person', 'embedding'), 'indicesDeleted'],
      [await graph.dropEdgeRangeIndex('KNOWS', 'since'), 'indicesDeleted'],
    ] as const;

    for (const [reply, counter] of replies) {
      expect(Object.keys(reply)).toEqual(['stats']);
      expect(reply).not.toHaveProperty('metadata');
      expect(reply.stats[counter]).toBe(1);
      expect(reply.stats.queryInternalExecutionTime).toBeGreaterThan(0);
    }
  });
});
