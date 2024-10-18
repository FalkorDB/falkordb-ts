export const FIRST_KEY_INDEX = 1;

export const IS_READ_ONLY = true;

/**
 * Transforms arguments for a GRAPH.PROFILE operation.
 * @param {string} key - The key associated with the graph profile.
 * @param {string} query - The query string to be used for profiling.
 * @returns {Array<string>} An array containing the command 'GRAPH.PROFILE', the key, and the query.
 */
export function transformArguments(key: string, query: string): Array<string> {
    return ['GRAPH.PROFILE', key, query];
}

export declare function transfromReply(): Array<string>;
