export const IS_READ_ONLY = true;

/**
 * Retrieves the sentinel masters configuration.
 * @returns {Array<string>} An array containing the sentinel configuration keywords.
 */
export function transformArguments(): Array<string> {
        return ['SENTINEL', 'MASTERS'];
}

export declare function transformReply(): Array<Array<string>>;
