
export function transformArguments( srcGraph: string, destGraph: string): Array<string> {
    return [
        'GRAPH.COPY',
        srcGraph,
        destGraph
    ];
}

export declare function transformReply(): 'OK';
