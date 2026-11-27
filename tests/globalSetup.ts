import { createClient } from 'redis';
import { serverAnswersSchemaHash, serverModuleVersion } from './serverVersion';

// How each engine rejects a stale `version`
const SCHEMA_VERSION_SCHEMES: Array<[RegExp, string]> = [
    [/^version mismatch$/, 'hash'],
    [/^(?:ERR )?invalid graph version$/, 'counter'],
];

/**
 * Records in `FALKORDB_SCHEMA_VERSION` how the server under test versions a
 * graph's schema, so tests can assert what each scheme does: `hash` for
 * the C engine (FalkorDB 4.x) (a hash of the schema names), `counter`
 * for the Rust engine (6.x, a count of schema-changing writes). They word the
 * rejection of a stale version differently, which tells them apart. Left
 * unset when the probe cannot tell (no server, a server that is not FalkorDB,
 * an unknown reply), so that a test run never fails here.
 *
 * Also records in `FALKORDB_SCHEMA_HASH` whether the server answers
 * `SCHEMA_HASH` (FalkorDB 6.2.0 and later): `supported` or `unsupported`,
 * or unset when that probe fails. Each probe runs whatever the other found.
 * Both, and the `graph` module version, are logged, so that a CI log always
 * says which server it ran against.
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
    }

    try {
        process.env.FALKORDB_SCHEMA_HASH =
            (await serverAnswersSchemaHash(client)) ? 'supported' : 'unsupported';
    } catch {
        // The probe failed: leave it unset, which tests read as unknown
    }

    // Name the server in the log, so a failure says which CI leg it came from
    const version = await serverModuleVersion(client).catch((error: Error) => error.message);
    console.log(
        `FalkorDB under test: graph module ${version}, ` +
        `schema version ${process.env.FALKORDB_SCHEMA_VERSION ?? 'unknown'}, ` +
        `SCHEMA_HASH ${process.env.FALKORDB_SCHEMA_HASH ?? 'unknown'}`
    );
    await client.quit().catch(() => {});
}
