export const IS_READ_ONLY = true;

/**
 * Transforms arguments for a Redis SENTINEL MASTER command.
 * @param {string} dbname - The name of the database to query for the master.
 * @returns {Array<string>} An array of strings representing the Redis SENTINEL MASTER command arguments.
 */
export function transformArguments(dbname: string): Array<string> {
        return ['SENTINEL', 'MASTER', dbname];
}

export declare function transformReply(): Array<string>;
