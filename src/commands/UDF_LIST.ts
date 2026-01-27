import { CommandParser } from '@redis/client';

export const IS_READ_ONLY = true;

// UDF library entry: [library_name, [function_names...]]
// or with code: [library_name, [function_names...], code]
export type UdfLibraryEntry = [string, string[]] | [string, string[], string];

export type UdfListReply = UdfLibraryEntry[];

export function parseCommand(
    parser: CommandParser,
    lib?: string,
    withCode: boolean = false
): void {
    parser.push('GRAPH.UDF', 'LIST');
    
    if (lib !== undefined) {
        parser.push(lib);
    }
    
    if (withCode) {
        parser.push('WITHCODE');
    }
}

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

export function transformReply(reply: unknown): UdfListReply {
    return reply as UdfListReply;
}
