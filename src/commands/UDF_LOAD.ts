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
    
    // If script is a function, convert it to string and add falkor.register() call
    let scriptStr: string;
    if (typeof script === 'function') {
        const functionStr = script.toString();
        const functionName = script.name;
        
        if (!functionName) {
            throw new Error('Function must have a name to be registered as a UDF');
        }
        
        // Add the function definition and register call
        scriptStr = `${functionStr}\nfalkor.register("${functionName}", ${functionName});`;
    } else {
        scriptStr = script;
    }
    
    args.push(scriptStr);
    
    return args;
}

export declare function transformReply(): string;
