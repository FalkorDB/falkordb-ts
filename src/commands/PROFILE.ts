import { CommandParser } from '@redis/client';

export const FIRST_KEY_INDEX = 1;

// PROFILE executes the query, which may write
export const IS_READ_ONLY = false;

export function parseCommand(parser: CommandParser, key: string, query: string): void {
    parser.push('GRAPH.PROFILE');
    parser.pushKey(key);
    parser.push(query);
}

export function transformArguments(key: string, query: string): Array<string> {
    return ['GRAPH.PROFILE', key, query];
}

export function transformReply(reply: unknown): Array<string> {
    return reply as Array<string>;
}
