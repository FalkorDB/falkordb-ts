export function transformArguments(configKey: string, value: number | string): Array<string> {
    return [
        'GRAPH.CONFIG',
        'SET',
        configKey,
        typeof value === "string" ? value : value.toString()
    ];
}

export declare function transformReply(): 'OK';
