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
        
        // Validate function name is a valid JavaScript identifier to prevent injection
        const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
        if (!validIdentifierRegex.test(functionName)) {
            throw new Error(`Invalid function name: "${functionName}". Function name must be a valid JavaScript identifier.`);
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
