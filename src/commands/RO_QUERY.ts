import { RedisCommandArgument, RedisCommandArguments } from '@redis/client/dist/lib/commands';
import { pushQueryArguments, QueryOptionsBackwardCompatible } from '.';

export { FIRST_KEY_INDEX } from './QUERY';

export const IS_READ_ONLY = true;

/**
 * Transforms arguments for a Redis Graph read-only query
 * @param {RedisCommandArgument} graph - The name of the graph to query
 * @param {RedisCommandArgument} query - The query to execute
 * @param {QueryOptionsBackwardCompatible} [options] - Optional query options
 * @param {boolean} [compact] - Optional flag to enable compact output
 * @returns {RedisCommandArguments} An array of arguments ready for the Redis command
 */
export function transformArguments(
    graph: RedisCommandArgument,
    query: RedisCommandArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean
): RedisCommandArguments {
    return pushQueryArguments(
        ['GRAPH.RO_QUERY'],
        graph,
        query,
        options,
        compact
    );
}

export { transformReply } from './QUERY';
