export const IS_READ_ONLY = true;

export const FIRST_KEY_INDEX = 1;

/**
 * Transforms arguments for the GRAPH.SLOWLOG command.
 * @param {string} key - The key of the graph to retrieve the slow log for.
 * @returns {string[]} An array containing the GRAPH.SLOWLOG command and the key.
 */
export function transformArguments(key: string) {
    return ['GRAPH.SLOWLOG', key];
}

type SlowLogRawReply = Array<[
    timestamp: string,
    command: string,
    query: string,
    took: string
]>;

type SlowLogReply = Array<{
    timestamp: Date;
    command: string;
    query: string;
    took: number;
}>;

/**
 * Transforms an array of raw slow log entries into a structured format.
 * @param {SlowLogRawReply} logs - An array of raw slow log entries, each containing timestamp, command, query, and execution time.
 * @returns {SlowLogReply} An array of structured slow log entries with parsed timestamp and numeric execution time.
 */
export function transformReply(logs: SlowLogRawReply): SlowLogReply {
    return logs.map(([timestamp, command, query, took]) => ({
        timestamp: new Date(Number(timestamp) * 1000),
        command,
        query,
        took: Number(took)
    }));
}
