export const IS_READ_ONLY = true;

/**
 * Returns an array containing the command string for listing all graphs.
 * @returns {Array<string>} An array with a single string element 'GRAPH.LIST'.
 */
export function transformArguments(): Array<string> {
    return ['GRAPH.LIST'];
}

export declare function transformReply(): Array<string>;
