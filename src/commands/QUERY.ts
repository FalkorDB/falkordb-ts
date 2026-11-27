import { RedisArgument, CommandParser } from '@redis/client';
import { pushQueryArguments } from '.';
import { SchemaVersionMismatchError } from '../errors';
import type {
    GraphMetadata,
    QueryOptionsBackwardCompatible,
    QueryRawReply,
    QueryReply,
    SchemaReply,
} from '../types';

export type { QueryReply, SchemaReply };

export const FIRST_KEY_INDEX = 1;

export function parseCommand(
    parser: CommandParser,
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean,
    version?: number,
    schemaHash?: string
): void {
    // The graph is pushed as a key so that cluster clients route the command
    // to the graph's shard rather than a random node
    const [, ...args] = pushQueryArguments(
        [],
        graph,
        query,
        options,
        compact,
        version,
        schemaHash
    );
    parser.push('GRAPH.QUERY');
    parser.pushKey(graph);
    parser.push(...args);
}

export function transformArguments(
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean,
    version?: number,
    schemaHash?: string
): Array<RedisArgument> {
    return pushQueryArguments(
        ['GRAPH.QUERY'],
        graph,
        query,
        options,
        compact,
        version,
        schemaHash
    );
}

// How the server words the rejection of a stale `version`: the C engine says
// `version mismatch`, the Rust engine `ERR invalid graph version`
const VERSION_MISMATCH = /^(?:ERR )?(?:version mismatch|invalid graph version)$/;

export function transformReply(reply: QueryRawReply): QueryReply {
    // A query sent with a stale `version` is rejected with
    // `[error, current version]` and not executed
    const [first, second] = reply as unknown[];
    if (first instanceof Error) {
        if (VERSION_MISMATCH.test(first.message)) {
            // A string when integers are returned as their exact digits
            throw new SchemaVersionMismatchError(Number(second));
        }
        throw first;
    }

    // A query sent with `SCHEMA_HASH` gets the schema as an extra, last
    // element: `[stats, schema]` for a query that returns no rows, so the
    // shapes can only be told apart once it is removed
    const schema = reply.length > 1 ? parseSchemaElement(reply[reply.length - 1]) : undefined;
    const rest = (schema ? reply.slice(0, -1) : reply) as unknown[];

    const parsed = (rest.length === 1 ? {
        headers: undefined,
        data: undefined,
        metadata: rest[0]
    } : {
        headers: rest[0],
        data: rest[1],
        metadata: rest[2]
    }) as QueryReply;
    if (schema) parsed.schema = schema;
    return parsed;
}

const SCHEMA_LISTS = ['labels', 'relationshipTypes', 'propertyKeys'] as const;

/**
 * Reads the schema element FalkorDB 6.2.0 and later append to a reply when
 * the query was sent with `SCHEMA_HASH`: under RESP 2 a flat
 * `['hash', h, 'labels', [...], 'relationshipTypes', [...], 'propertyKeys', [...]]`,
 * or `['hash', h]` alone when `h` is the hash the query was sent with. Returns
 * `undefined` for anything else, such as the statistics that end every reply
 * from an older server. Keys are read by name and unknown ones ignored.
 */
export function parseSchemaElement(element: unknown): SchemaReply | undefined {
    if (
        !Array.isArray(element) ||
        element.length < 2 ||
        element.length % 2 !== 0 ||
        element[0] !== 'hash'
    ) {
        return undefined;
    }

    const fields = new Map<unknown, unknown>();
    for (let i = 0; i < element.length; i += 2) {
        fields.set(element[i], element[i + 1]);
    }

    const schema: SchemaReply = { hash: parseSchemaHash(fields.get('hash')) };

    const present = SCHEMA_LISTS.filter((key) => fields.has(key));
    if (present.length === 0) return schema;
    if (present.length !== SCHEMA_LISTS.length) {
        throw new Error(
            `Invalid schema in reply: ${SCHEMA_LISTS.filter((key) => !fields.has(key)).join(', ')} missing`
        );
    }

    const names = {} as GraphMetadata;
    for (const key of SCHEMA_LISTS) {
        const list = fields.get(key);
        if (!Array.isArray(list) || !list.every((name) => typeof name === 'string')) {
            throw new Error(`Invalid schema in reply: ${key} is not a list of names`);
        }
        names[key] = list;
    }
    schema.names = names;
    return schema;
}

// The hash is a 64-bit integer, so it is read from its exact digits: a
// number would round it, and sent back rounded it would never match
function parseSchemaHash(hash: unknown): string {
    if (typeof hash === 'string' && /^-?\d+$/.test(hash)) return hash;
    if (typeof hash === 'number' && Number.isInteger(hash)) return BigInt(hash).toString();
    if (typeof hash === 'bigint') return hash.toString();
    throw new Error(`Invalid schema hash in reply: ${String(hash)}`);
}
