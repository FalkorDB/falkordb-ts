export const IS_READ_ONLY = true;
export const NOT_KEYED_COMMAND = true;

export function transformArguments(): Array<string> {
    return ['GRAPH.LIST'];
}

export declare function transformReply(): Array<string>;
