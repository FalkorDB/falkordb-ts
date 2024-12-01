import { RedisCommandArgument, RedisCommandArguments } from '@redis/client/dist/lib/commands';
import { pushQueryArguments, QueryOptionsBackwardCompatible } from '.';

export const FIRST_KEY_INDEX = 1;

/**
 * Transforms arguments for a Redis Graph query command.
 * @param {RedisCommandArgument} graph - The name of the graph to query.
 * @param {RedisCommandArgument} query - The Cypher query to execute.
 * @param {QueryOptionsBackwardCompatible} [options] - Optional query parameters.
 * @param {boolean} [compact] - Optional flag to enable compact output.
 * @returns {RedisCommandArguments} An array of arguments ready for the Redis GRAPH.QUERY command.
 */
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

type Headers = Array<string>;

type Data = Array<string | number | null | Data>;

type Metadata = Array<string>;

type QueryRawReply = [
    headers: Headers,
    data: Data,
    metadata: Metadata
] | [
    metadata: Metadata
];

export type QueryReply = {
    headers: undefined;
    data: undefined;
    metadata: Metadata;
} | {
    headers: Headers;
    data: Data;
    metadata: Metadata;
};

/**
 * Transforms a QueryRawReply into a QueryReply object.
 * @param {QueryRawReply} reply - The raw reply to be transformed. It can be either an array with one or three elements.
 * @returns {QueryReply} The transformed reply object with headers, data, and metadata properties.
 */
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
