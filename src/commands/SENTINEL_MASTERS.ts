import { CommandParser } from '@redis/client';

export const IS_READ_ONLY = true;

export function parseCommand(parser: CommandParser): void {
    parser.push('SENTINEL', 'MASTERS');
}

export function transformArguments(): Array<string> {
        return ['SENTINEL', 'MASTERS'];
}

export function transformReply(reply: unknown): Array<Array<string>> {
    return reply as Array<Array<string>>;
}
