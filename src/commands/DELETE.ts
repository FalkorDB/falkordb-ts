import { CommandParser } from '@redis/client';

export const FIRST_KEY_INDEX = 1;

export function parseCommand(parser: CommandParser, key: string): void {
    parser.push('GRAPH.DELETE');
    parser.pushKey(key);
}

export function transformArguments(key: string): Array<string> {
    return ['GRAPH.DELETE', key];
}

export function transformReply(reply: unknown): string {
    return reply as string;
}
