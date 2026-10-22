import { CommandParser } from '@redis/client';

export const FIRST_KEY_INDEX = 1;

// GRAPH.SLOWLOG key RESET
export function parseCommand(parser: CommandParser, key: string): void {
    parser.push('GRAPH.SLOWLOG');
    parser.pushKey(key);
    parser.push('RESET');
}

export function transformArguments(key: string): Array<string> {
    return ['GRAPH.SLOWLOG', key, 'RESET'];
}

export function transformReply(reply: unknown): 'OK' {
    return reply as 'OK';
}
