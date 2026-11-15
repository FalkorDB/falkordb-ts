import { jest, describe, it, beforeAll, afterEach, afterAll, expect } from '@jest/globals';
import { ClientClosedError, createClient } from 'redis';
import FalkorDB from '../src/falkordb';
import Graph, { ConstraintType, EntityType } from '../src/graph';
import { Sentinel } from '../src/clients/sentinel';

const SENTINEL_HOST = process.env.SENTINEL_HOST || 'sentinel-1';
const SENTINEL_PORT = parseInt(process.env.SENTINEL_PORT || '26379', 10);
// The name docker/sentinel-compose.yml monitors the master under
const MASTER_NAME = 'master';

function graphName(prefix: string) {
    return `${prefix}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Opens a plain connection, runs `fn` on it, and closes it again. */
async function withRawClient<T>(
    socket: { host: string; port: number },
    fn: (client: ReturnType<typeof createClient>) => Promise<T>
): Promise<T> {
    const client = createClient({ socket: { ...socket, reconnectStrategy: false } });
    client.on('error', () => {});
    await client.connect();
    try {
        return await fn(client);
    } finally {
        // Not quit(): a Valkey sentinel rejects QUIT as an unknown command
        client.destroy();
    }
}

/** The master's address, as the sentinel reports it right now. */
async function masterAddress() {
    const [host, port] = await withRawClient({ host: SENTINEL_HOST, port: SENTINEL_PORT }, client =>
        client.sendCommand(['SENTINEL', 'GET-MASTER-ADDR-BY-NAME', MASTER_NAME])) as [string, string];
    return { host, port: Number(port) };
}

/** Where the connection that `db` sends commands on is pointed. */
async function connectionAddress(db: FalkorDB) {
    const { host, port } = ((await db.connection).options?.socket ?? {}) as { host?: string; port?: number };
    return { host, port };
}

/** Polls the graph's constraints until `done` holds, or fails after `timeoutMs`. */
async function waitForConstraints(
    graph: Graph,
    done: (constraints: Awaited<ReturnType<Graph['listConstraints']>>) => boolean,
    timeoutMs = 10000
) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const constraints = await graph.listConstraints();
        if (done(constraints)) return constraints;
        if (Date.now() > deadline) {
            throw new Error(`Constraints never reached the expected state: ${JSON.stringify(constraints)}`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

describe('Sentinel Integration Tests', () => {
    let sentinelClient: FalkorDB;

    // Each test removes its graphs; the cleanup must not hide the test's own
    // failure, so it only runs here and tolerates graphs that never got created
    const graphs: Graph[] = [];
    function selectGraph(prefix: string) {
        const graph = sentinelClient.selectGraph(graphName(prefix));
        graphs.push(graph);
        return graph;
    }

    beforeAll(async () => {
        // No try/catch: without a sentinel every test here must fail, not pass
        sentinelClient = await FalkorDB.connect({
            socket: { host: SENTINEL_HOST, port: SENTINEL_PORT },
        });
    });

    afterEach(async () => {
        await Promise.all(graphs.splice(0).map(graph => graph.delete().catch(() => undefined)));
    });

    afterAll(async () => {
        if (sentinelClient) {
            await sentinelClient.close();
        }
    });

    beforeAll(() => {
      jest.spyOn(console, 'debug').mockImplementation(() => {});
    });
    afterAll(() => {
      (console.debug as jest.Mock).mockRestore();
    });

    it('should create sentinel client instance', async () => {
        expect(await connectionAddress(sentinelClient)).toEqual(await masterAddress());
    });

    it('sends commands to the master the sentinel names', async () => {
        const graph = selectGraph('sentinel-master');
        await graph.query('CREATE (:Probe {value: 1})');

        // Read it back from the master directly, not through the client
        const master = await masterAddress();
        const reply = await withRawClient(master, client =>
            client.sendCommand(['GRAPH.RO_QUERY', graph.name, 'MATCH (p:Probe) RETURN p.value']));
        expect(reply).toEqual([['p.value'], [[1]], expect.any(Array)]);
    });

    it('should execute query through sentinel', async () => {
        const graph = selectGraph('test-graph');
        const result = await graph.query('RETURN 1 as num');
        expect(result.data).toEqual([{ num: 1 }]);
    });

    it('should list graphs through sentinel', async () => {
        const graph = selectGraph('list-graph');
        await graph.query('CREATE ()');
        expect(await sentinelClient.list()).toContain(graph.name);
    });

    it('should get config through sentinel', async () => {
        const config = await sentinelClient.configGet('RESULTSET_SIZE');
        expect(config).toEqual(['RESULTSET_SIZE', expect.any(Number)]);
    });

    it('should get info through sentinel', async () => {
        const info = await sentinelClient.info();
        expect(info).toEqual(expect.arrayContaining(['# Running queries', '# Waiting queries']));
    });

    it('keeps using the same master connection across commands', async () => {
        const before = await sentinelClient.connection;
        await sentinelClient.info();
        await sentinelClient.list();
        await sentinelClient.info();
        expect(await sentinelClient.connection).toBe(before);
    });

    it('should handle graph operations through sentinel', async () => {
        const graph = selectGraph('test-sentinel-ops');
        await graph.query('CREATE (n:Person {name: "test"})');
        const result = await graph.query('MATCH (n:Person) RETURN n.name');
        expect(result.data).toEqual([{ 'n.name': 'test' }]);
    });

    it('should execute read-only query through sentinel', async () => {
        const graph = selectGraph('test-graph-ro');
        // A read-only query cannot create the graph
        await graph.query('CREATE ()');
        const result = await graph.roQuery('RETURN 1 as num');
        expect(result.data).toEqual([{ num: 1 }]);
    });

    it('should explain query through sentinel', async () => {
        const graph = selectGraph('test-graph-explain');
        await graph.query('CREATE (:Person)');
        const plan = await graph.explain('MATCH (p:Person) RETURN p');
        expect([...plan].map(operation => operation.name)).toContain('Node By Label Scan');
    });

    it('should profile query through sentinel', async () => {
        const graph = selectGraph('test-graph-profile');
        const plan = await graph.profile('RETURN 1');
        expect(plan.root).toMatchObject({ name: 'Project', recordsProduced: 1 });
    });

    it('should set config through sentinel', async () => {
        const [, original] = await sentinelClient.configGet('RESULTSET_SIZE') as [string, number];
        try {
            await sentinelClient.configSet('RESULTSET_SIZE', 1000);
            expect(await sentinelClient.configGet('RESULTSET_SIZE')).toEqual(['RESULTSET_SIZE', 1000]);
        } finally {
            await sentinelClient.configSet('RESULTSET_SIZE', original);
        }
        expect(await sentinelClient.configGet('RESULTSET_SIZE')).toEqual(['RESULTSET_SIZE', original]);
    });

    it('should get info with section through sentinel', async () => {
        expect(await sentinelClient.info('RunningQueries')).toEqual(['# Running queries', []]);
    });

    it('should create constraints through sentinel', async () => {
        const graph = selectGraph('test-constraint-graph');
        await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'id');
        const constraints = await waitForConstraints(graph, list => list.some(c => c.status === 'OPERATIONAL'));
        expect(constraints).toEqual([
            { type: 'UNIQUE', label: 'Person', properties: ['id'], entityType: 'NODE', status: 'OPERATIONAL' },
        ]);
    });

    it('should drop constraints through sentinel', async () => {
        const graph = selectGraph('test-constraint-drop-graph');
        await graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email');
        await waitForConstraints(graph, list => list.some(c => c.status === 'OPERATIONAL'));

        await graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'Person', 'email');
        expect(await graph.listConstraints()).toEqual([]);
    });

    it('should copy graphs through sentinel', async () => {
        const sourceGraph = selectGraph('source-graph');
        await sourceGraph.query('CREATE (n:Test {value: 1})');

        const destGraph = await sourceGraph.copy(graphName('dest-graph'));
        graphs.push(destGraph);

        expect((await destGraph.query('MATCH (n:Test) RETURN n.value')).data).toEqual([{ 'n.value': 1 }]);
        expect((await sourceGraph.query('MATCH (n:Test) RETURN n.value')).data).toEqual([{ 'n.value': 1 }]);
    });

    it('should handle multiple graph operations through sentinel', async () => {
        const graph1 = selectGraph('multi-graph-1');
        const graph2 = selectGraph('multi-graph-2');

        await graph1.query('CREATE (n:User {name: "Alice"})');
        await graph2.query('CREATE (n:Product {name: "Book"})');

        expect((await graph1.query('MATCH (n:User) RETURN n.name')).data).toEqual([{ 'n.name': 'Alice' }]);
        expect((await graph2.query('MATCH (n:Product) RETURN n.name')).data).toEqual([{ 'n.name': 'Book' }]);
        // Each graph only holds its own data
        expect((await graph1.query('MATCH (n:Product) RETURN n')).data).toEqual([]);
    });

    it('should handle connection stability and errors gracefully', async () => {
        const graph = selectGraph('stability-graph');
        await graph.query('CREATE ()');

        const [info, list, infoAgain] = await Promise.all([
            sentinelClient.info(),
            sentinelClient.list(),
            sentinelClient.info(),
        ]);
        expect(info).toEqual(expect.arrayContaining(['# Running queries']));
        expect(list).toContain(graph.name);
        expect(infoAgain).toEqual(expect.arrayContaining(['# Running queries']));
    });

    it('should handle invalid operations through sentinel', async () => {
        await expect(sentinelClient.configGet('INVALID_CONFIG')).rejects.toThrow('Unknown configuration field');
    });

    it('should handle concurrent operations through sentinel', async () => {
        const [info, list, config] = await Promise.all([
            sentinelClient.info(),
            sentinelClient.list(),
            sentinelClient.configGet('RESULTSET_SIZE'),
        ]);
        expect(info).toEqual(expect.arrayContaining(['# Running queries']));
        expect(Array.isArray(list)).toBe(true);
        expect(config).toEqual(['RESULTSET_SIZE', expect.any(Number)]);
    });

    it('should handle large query results through sentinel', async () => {
        const graph = selectGraph('large-result-graph');
        await graph.query('UNWIND range(1, 100) AS i CREATE (n:Number {value: i})');
        const result = await graph.query<{ 'n.value': number }>('MATCH (n:Number) RETURN n.value ORDER BY n.value');

        expect(result.data?.map(row => row['n.value'])).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    });

    it('should handle query parameters through sentinel', async () => {
        const graph = selectGraph('param-graph');

        const result = await graph.query(
            'CREATE (n:Person {name: $name, age: $age}) RETURN n.name AS name, n.age AS age',
            { params: { name: 'John', age: 30 } }
        );

        expect(result.data).toEqual([{ name: 'John', age: 30 }]);
    });

    it('should handle timeout parameters through sentinel', async () => {
        const graph = selectGraph('timeout-graph');
        const result = await graph.query('RETURN 1', { TIMEOUT: 1000 });
        expect(result.data).toEqual([{ '1': 1 }]);
    });

    it('should handle complex queries through sentinel', async () => {
        const graph = selectGraph('complex-graph');
        await graph.query(`
            CREATE (alice:Person {name: 'Alice', age: 30})
            CREATE (bob:Person {name: 'Bob', age: 25})
            CREATE (charlie:Person {name: 'Charlie', age: 35})
            CREATE (alice)-[:KNOWS]->(bob)
            CREATE (bob)-[:KNOWS]->(charlie)
            CREATE (alice)-[:KNOWS]->(charlie)
        `);

        const result = await graph.query(`
            MATCH (p:Person)-[:KNOWS]->(friend:Person)
            RETURN p.name, friend.name, p.age + friend.age AS combined_age
            ORDER BY combined_age
        `);

        expect(result.data).toEqual([
            { 'p.name': 'Alice', 'friend.name': 'Bob', combined_age: 55 },
            { 'p.name': 'Bob', 'friend.name': 'Charlie', combined_age: 60 },
            { 'p.name': 'Alice', 'friend.name': 'Charlie', combined_age: 65 },
        ]);
    });

    it('should handle graph statistics through sentinel', async () => {
        const graph = selectGraph('stats-graph');
        const result = await graph.query('CREATE (n:StatNode {value: 42}) RETURN n');
        expect(result.stats).toMatchObject({ nodesCreated: 1, propertiesSet: 1 });
    });

    it('should handle cleanup operations through sentinel', async () => {
        const graph = sentinelClient.selectGraph(graphName('cleanup-graph'));
        await graph.query('CREATE ()');
        expect(await sentinelClient.list()).toContain(graph.name);

        await graph.delete();
        expect(await sentinelClient.list()).not.toContain(graph.name);
    });


    it('should throw if multiple masters are returned', async () => {
      const fakeClient: any = {
        options: {},
        falkordb: {
          sentinelMasters: jest.fn<() => Promise<string[][]>>().mockResolvedValue([
            ['ip', '127.0.0.1', 'port', '6379'],
            ['ip', '127.0.0.2', 'port', '6380'],
          ]),
        },
      };
      const fakeFalkorDB = new FalkorDB();
      jest.spyOn(fakeFalkorDB, 'emit');
      const sentinel = new Sentinel(fakeClient);
      await expect(
        sentinel['tryConnectSentinelServer'](fakeClient, {}, fakeFalkorDB)
      ).rejects.toThrow('Multiple masters are not supported');
    });

    it('should reject connecting when the sentinel cannot be reached', async () => {
        // `.invalid` never resolves (RFC 2606)
        await expect(FalkorDB.connect({ socket: { host: 'sentinel.invalid', port: SENTINEL_PORT } }))
            .rejects.toThrow(/^Failed to connect to FalkorDB: getaddrinfo ENOTFOUND sentinel\.invalid/);
    });


    it('recovers when the master connection is dropped', async () => {
        const db = await FalkorDB.connect({ socket: { host: SENTINEL_HOST, port: SENTINEL_PORT } });
        try {
            const before = await db.connection;
            const id = await before.sendCommand(['CLIENT', 'ID']);
            const master = await masterAddress();
            await withRawClient(master, client => client.sendCommand(['CLIENT', 'KILL', 'ID', String(id)]));

            // Read-only, so it is resent on a new master connection
            expect(Array.isArray(await db.list())).toBe(true);
            const after = await db.connection;
            expect(after).not.toBe(before);
            expect(await connectionAddress(db)).toEqual(master);
        } finally {
            await db.close();
        }
    });

    it('should test multiple sentinels connectivity', async () => {
        const sentinelConfigs = [
            { host: 'sentinel-1', port: 26379 },
            { host: 'sentinel-2', port: 26380 },
            { host: 'sentinel-3', port: 26381 }
        ];
        const master = await masterAddress();

        for (const config of sentinelConfigs) {
            const client = await FalkorDB.connect({ socket: config });
            try {
                expect(await connectionAddress(client)).toEqual(master);
                const graph = client.selectGraph(graphName('multi-sentinel'));
                try {
                    expect((await graph.query('RETURN 1 AS num')).data).toEqual([{ num: 1 }]);
                } finally {
                    await graph.delete().catch(() => undefined);
                }
            } finally {
                await client.close();
            }
        }
    });


    it('should test constraint drop error handling on real sentinel', async () => {
        const graph = selectGraph('constraint-error-test-graph');
        await graph.query('CREATE ()');

        await expect(graph.constraintDrop(ConstraintType.UNIQUE, EntityType.NODE, 'NonExistentLabel', 'nonExistentProperty'))
            .rejects.toThrow('Unable to drop constraint, no such constraint.');
    });

    it('should test sentinel disconnect and quit methods', async () => {
        const tempClient = await FalkorDB.connect({
            socket: { host: 'sentinel-2', port: 26380 },
        });
        try {
            expect(await tempClient.info()).toEqual(expect.arrayContaining(['# Running queries']));
        } finally {
            // close() also disconnects the sentinel connection
            await tempClient.close();
        }
        await expect(tempClient.info()).rejects.toThrow(ClientClosedError);
    });

    it('should test sentinel configuration edge cases', async () => {
        await expect(sentinelClient.configGet('TOTALLY_INVALID_CONFIG_KEY')).rejects.toThrow('Unknown configuration field');
        await expect(sentinelClient.configSet('INVALID_KEY', 'invalid_value')).rejects.toThrow('Unknown configuration field');
    });

    it('should test graph operations with transaction-like behavior', async () => {
        const graph = selectGraph('transaction-test-graph');

        // Several operations in sequence on the same connection
        await graph.query('CREATE (n1:TestNode {id: 1, name: "First"})');
        await graph.query('CREATE (n2:TestNode {id: 2, name: "Second"})');
        await graph.query('MATCH (n1:TestNode {id: 1}), (n2:TestNode {id: 2}) CREATE (n1)-[:CONNECTS]->(n2)');

        const result = await graph.query('MATCH (n1:TestNode)-[r:CONNECTS]->(n2:TestNode) RETURN n1.name, n2.name');
        expect(result.data).toEqual([{ 'n1.name': 'First', 'n2.name': 'Second' }]);
    });

    it('should test error boundaries in sentinel operations', async () => {
        const graph = selectGraph('error-boundary-test');

        expect((await graph.query('RETURN 1')).data).toEqual([{ '1': 1 }]);
        expect((await graph.roQuery('RETURN 2')).data).toEqual([{ '2': 2 }]);
        expect((await graph.explain('RETURN 3')).root.name).toBe('Project');
        expect((await graph.profile('RETURN 4')).root).toMatchObject({ name: 'Project', recordsProduced: 1 });
        // A failing query leaves the connection usable
        await expect(graph.query('RETURN nonexistent_function()')).rejects.toThrow(/Unknown function 'nonexistent_function'/);
        expect((await graph.query('RETURN 5')).data).toEqual([{ '5': 5 }]);
    });
});
