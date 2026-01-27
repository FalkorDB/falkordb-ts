import { CommandParser } from '@redis/client';

export function parseCommand(parser: CommandParser, lib: string): void {
    parser.push('GRAPH.UDF', 'DELETE', lib);
}

export function transformArguments(lib: string): Array<string> {
    return ['GRAPH.UDF', 'DELETE', lib];
}

export function transformReply(reply: unknown): string {
    return reply as string;
}
