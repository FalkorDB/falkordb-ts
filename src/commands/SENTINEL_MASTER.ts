import { CommandParser } from '@redis/client';

export const IS_READ_ONLY = true;

export function parseCommand(parser: CommandParser, dbname: string): void {
    parser.push('SENTINEL', 'MASTER', dbname);
}

export function transformArguments(dbname: string): Array<string> {
        return ['SENTINEL', 'MASTER', dbname];
}

export function transformReply(reply: unknown): Array<string> {
    return reply as Array<string>;
}
