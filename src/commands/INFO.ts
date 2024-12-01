export const IS_READ_ONLY = true;

/**
 * Transforms arguments for the GRAPH.INFO command.
 * @param {string} [section] - Optional section parameter to specify a particular section of graph information.
 * @returns {Array<string>} An array of strings representing the command arguments.
 */
export function transformArguments(section?: string): Array<string> {
    const args = ['GRAPH.INFO'];

    if (section) {
        args.push(section);
    }

    return args;
}

export declare function transformReply(): Array<string | Array<string>>;
