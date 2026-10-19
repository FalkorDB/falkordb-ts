import { RedisArgument, CommandParser } from '@redis/client';
import { pushQueryArguments } from '.';
import { SchemaVersionMismatchError } from '../errors';
import type { QueryOptionsBackwardCompatible, QueryRawReply, QueryReply } from '../types';

export type { QueryReply };

export const FIRST_KEY_INDEX = 1;

export function parseCommand(
    parser: CommandParser,
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean,
    version?: number
): void {
    const args = pushQueryArguments(
        ['GRAPH.QUERY'],
        graph,
        query,
        options,
        compact,
        version
    );
    parser.push(...args);
}

export function transformArguments(
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean,
    version?: number
): Array<RedisArgument> {
    return pushQueryArguments(
        ['GRAPH.QUERY'],
        graph,
        query,
        options,
        compact,
        version
    );
}

export function transformReply(reply: QueryRawReply): QueryReply {
    // A query sent with a stale `version` is rejected with
    // `[error "version mismatch", current version]` and not executed
    const [first, second] = reply as unknown[];
    if (first instanceof Error) {
        if (first.message === 'version mismatch') {
            throw new SchemaVersionMismatchError(second as number);
        }
        throw first;
    }

    return reply.length === 1 ? {
        headers: undefined,
        data: undefined,
        metadata: reply[0]
    } : {
        headers: reply[0],
        data: reply[1],
        metadata: reply[2]
    };
}
