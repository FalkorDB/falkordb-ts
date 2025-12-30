import { RedisCommandArgument, RedisCommandArguments } from '@redis/client/dist/lib/commands';
import { pushQueryArguments } from '.';
import { QueryOptionsBackwardCompatible, QueryRawReply, QueryReply } from '../types';

export const FIRST_KEY_INDEX = 1;

export function transformArguments(
    graph: RedisCommandArgument,
    query: RedisCommandArgument,
    options?: QueryOptionsBackwardCompatible,
    compact?: boolean
): RedisCommandArguments {
    return pushQueryArguments(
        ['GRAPH.QUERY'],
        graph,
        query,
        options,
        compact
    );
}

export function transformReply(reply: QueryRawReply): QueryReply {
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
