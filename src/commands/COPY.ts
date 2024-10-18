
/**
 * Transforms arguments for the GRAPH.COPY operation
 * @param {string} srcGraph - The name of the source graph to copy from
 * @param {string} destGraph - The name of the destination graph to copy to
 * @returns {Array<string>} An array of strings representing the Redis command and its arguments
 */
export function transformArguments( srcGraph: string, destGraph: string): Array<string> {
    return [
        'GRAPH.COPY',
        srcGraph,
        destGraph
    ];
}

export declare function transformReply(): 'OK';
