/**
 * How a server says it runs in its `INFO server` reply: `standalone`,
 * `sentinel` or `cluster`.
 */
export type ServerMode = 'standalone' | 'sentinel' | 'cluster';

// Redis names the field `redis_mode`. Valkey names it `server_mode`, unless
// `extended-redis-compatibility` is on, and FalkorDB images ship either one.
const MODE_FIELD = /^(?:redis|server)_mode:([^\r\n]*)\r?$/m;

/**
 * Reads the mode from an `INFO server` reply. A server that does not report a
 * mode we know of is treated as standalone.
 */
export function serverMode(info: string): ServerMode {
    const mode = MODE_FIELD.exec(info)?.[1].trim();
    return mode === 'sentinel' || mode === 'cluster' ? mode : 'standalone';
}
