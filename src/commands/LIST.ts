import { CommandParser } from '@redis/client';

export const IS_READ_ONLY = true;

export function parseCommand(parser: CommandParser): void {
    parser.push('GRAPH.LIST');
}

export function transformArguments(): Array<string> {
    return ['GRAPH.LIST'];
}

export function transformReply(reply: unknown): Array<string> {
    return reply as Array<string>;
}
