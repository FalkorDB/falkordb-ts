import { RedisArgument, CommandParser } from '@redis/client';
import { pushQueryArguments, QueryOptionsBackwardCompatible } from '.';

export { FIRST_KEY_INDEX } from './QUERY';

export const IS_READ_ONLY = true;

export function parseCommand(
    parser: CommandParser,
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean
): void {
    const args = pushQueryArguments(
        ['GRAPH.RO_QUERY'],
        graph,
        query,
        options,
        compact
    );
    parser.push(...args);
}

export function transformArguments(
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean
): Array<RedisArgument> {
    return pushQueryArguments(
        ['GRAPH.RO_QUERY'],
        graph,
        query,
        options,
        compact
    );
}

export { transformReply } from './QUERY';
