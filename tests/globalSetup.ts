import { createClient } from 'redis';

/**
 * Records in `FALKORDB_SCHEMA_VERSION` how the server under test versions a
 * graph's schema, so tests that only hold for one scheme can be skipped
 * visibly: `hash` for the C engine (a hash of the schema names), `counter`
 * for the Rust engine (a count of schema-changing writes). They word the
 * rejection of a stale version differently, which tells them apart. Left
 * unset when no server is reachable; those tests are skipped then anyway.
 */
export default async function globalSetup() {
    require('dns').setDefaultResultOrder('ipv4first');
    const client = createClient({
        RESP: 2,
        socket: {
            host: process.env.FALKORDB_HOST || 'localhost',
            port: parseInt(process.env.FALKORDB_PORT || '6379', 10),
            reconnectStrategy: false,
        },
    });
    client.on('error', () => {});
    try {
        await client.connect();
    } catch {
        return;
    }

    const graph = `schema-version-probe-${process.pid}`;
    try {
        await client.sendCommand(['GRAPH.QUERY', graph, 'CREATE (:Probe)']);
        // Any version the graph cannot have, except u32::MAX: the C engine
        // reads that as "no version given" and skips the check
        const [error] = (await client.sendCommand([
            'GRAPH.RO_QUERY', graph, 'RETURN 1', 'version', '4294967294',
        ])) as unknown[];
        if (error instanceof Error) {
            process.env.FALKORDB_SCHEMA_VERSION =
                /invalid graph version/.test(error.message) ? 'counter' : 'hash';
        }
    } finally {
        await client.sendCommand(['GRAPH.DELETE', graph]).catch(() => {});
        await client.quit();
    }
}
