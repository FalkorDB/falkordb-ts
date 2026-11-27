/**
 * What the tests ask the server under test about itself. Version-dependent
 * tests read the server through these, so that each one asserts what every
 * line does rather than assuming one (see CONTRIBUTING.md).
 */

/** Anything that sends a raw command: a node-redis client or connection */
export interface CommandSender {
    sendCommand(args: Array<string>): Promise<unknown>;
}

/**
 * The version of the server's `graph` module, as `MODULE LIST` reports it:
 * e.g. 42205 for 4.22.5 or 60201 for 6.2.1. The nightly `edge` build reports
 * a placeholder, 999999. The module is looked up by name, as 4.x lists
 * `vectorset` before it.
 */
export async function serverModuleVersion(server: CommandSender): Promise<number> {
    const modules = (await server.sendCommand(['MODULE', 'LIST'])) as unknown[];
    for (const module of modules) {
        if (!Array.isArray(module)) continue;
        const fields = new Map<unknown, unknown>();
        for (let i = 0; i + 1 < module.length; i += 2) fields.set(module[i], module[i + 1]);
        if (fields.get('name') !== 'graph') continue;
        const version = Number(fields.get('ver'));
        if (!Number.isInteger(version)) {
            throw new Error(`MODULE LIST reports graph version ${String(fields.get('ver'))}`);
        }
        return version;
    }
    throw new Error('MODULE LIST lists no graph module');
}

/**
 * Whether the server answers `SCHEMA_HASH` (FalkorDB 6.2.0 and later): it
 * appends `['hash', h, ...]` to the reply, where older servers ignore the
 * argument. Asked of the server itself rather than read from its version, as
 * `edge` reports no real one.
 */
export async function serverAnswersSchemaHash(server: CommandSender): Promise<boolean> {
    const probe = `schema-hash-probe-${process.pid}-${Math.floor(Math.random() * 999999)}`;
    try {
        const reply = (await server.sendCommand([
            'GRAPH.QUERY', probe, 'RETURN 1', '--compact', 'SCHEMA_HASH', '0',
        ])) as unknown[];
        const last = reply[reply.length - 1];
        return Array.isArray(last) && last[0] === 'hash';
    } finally {
        await server.sendCommand(['GRAPH.DELETE', probe]).catch(() => {});
    }
}
