export function transformArguments(
    name: string, 
    script: string | Function, 
    replace: boolean = false
): Array<string> {
    const args = ['GRAPH.UDF', 'LOAD'];
    
    if (replace) {
        args.push('REPLACE');
    }
    
    args.push(name);
    
    // If script is a function, convert it to string
    const scriptStr = typeof script === 'function' ? script.toString() : script;
    args.push(scriptStr);
    
    return args;
}

export declare function transformReply(): string;
