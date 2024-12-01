export const FIRST_KEY_INDEX = 1;

/**
 * Transforms the given key into an array of arguments for a GRAPH.DELETE command.
 * @param {string} key - The key to be deleted from the graph.
 * @returns {Array<string>} An array containing the GRAPH.DELETE command and the key.
 */
export function transformArguments(key: string): Array<string> {
    return ['GRAPH.DELETE', key];
}

export declare function transformReply(): string;
