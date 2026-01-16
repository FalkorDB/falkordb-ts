export function transformArguments(lib: string): Array<string> {
    return ['GRAPH.UDF', 'DELETE', lib];
}

export declare function transformReply(): string;
