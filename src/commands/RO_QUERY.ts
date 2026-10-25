import { RedisArgument, CommandParser } from '@redis/client';
import { pushQueryArguments, QueryOptionsBackwardCompatible } from '.';

export { FIRST_KEY_INDEX } from './QUERY';

export const IS_READ_ONLY = true;

export function parseCommand(
    parser: CommandParser,
    graph: RedisArgument,
    query: RedisArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean,
    version?: number
): void {
    // The graph is pushed as a key so that cluster clients route the command
    // to the graph's shard rather than a random node
    const [, ...args] = pushQueryArguments(
        [],
        graph,
        query,
        options,
        compact,
        version
    );
    parser.push('GRAPH.RO_QUERY');
    parser.pushKey(graph);
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
        ['GRAPH.RO_QUERY'],
        graph,
        query,
        options,
        compact,
        version
    );
}

export { transformReply } from './QUERY';
