import { createClient } from 'redis';

// How each engine rejects a stale `version`
const SCHEMA_VERSION_SCHEMES: Array<[RegExp, string]> = [
    [/^version mismatch$/, 'hash'],
    [/^(?:ERR )?invalid graph version$/, 'counter'],
];

/**
 * Records in `FALKORDB_SCHEMA_VERSION` how the server under test versions a
 * graph's schema, so tests that only hold for one scheme can be skipped
 * visibly: `hash` for the C engine (a hash of the schema names), `counter`
 * for the Rust engine (a count of schema-changing writes). They word the
 * rejection of a stale version differently, which tells them apart. Left
 * unset when the probe cannot tell (no server, a server that is not FalkorDB,
 * an unknown reply), so that a test run never fails here.
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
        const scheme = error instanceof Error
            && SCHEMA_VERSION_SCHEMES.find(([wording]) => wording.test(error.message));
        if (scheme) {
            process.env.FALKORDB_SCHEMA_VERSION = scheme[1];
        }
    } catch {
        // Not a FalkorDB, or not one this probe understands: leave it unset
    } finally {
        await client.sendCommand(['GRAPH.DELETE', graph]).catch(() => {});
        await client.quit().catch(() => {});
    }
}
