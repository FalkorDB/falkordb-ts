export const FIRST_KEY_INDEX = 1;

export const IS_READ_ONLY = true;

/**
 * Transforms arguments for a graph explanation query.
 * @param {string} key - The key associated with the graph.
 * @param {string} query - The query to be explained.
 * @returns {Array<string>} An array containing the command and its arguments for graph explanation.
 */
export function transformArguments(key: string, query: string): Array<string> {
    return ['GRAPH.EXPLAIN', key, query];
}

export declare function transfromReply(): Array<string>;
