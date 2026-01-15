export const IS_READ_ONLY = true;

export function transformArguments(
    lib?: string,
    withCode: boolean = false
): Array<string> {
    const args = ['GRAPH.UDF', 'LIST'];
    
    if (lib !== undefined) {
        args.push(lib);
    }
    
    if (withCode) {
        args.push('WITHCODE');
    }
    
    return args;
}

export declare function transformReply(): Array<any>;
