import { CommandParser } from '@redis/client';

export const IS_READ_ONLY = true;

export function parseCommand(parser: CommandParser, section?: string): void {
    parser.push('GRAPH.INFO');

    if (section) {
        parser.push(section);
    }
}

export function transformArguments(section?: string): Array<string> {
    const args = ['GRAPH.INFO'];

    if (section) {
        args.push(section);
    }

    return args;
}

export function transformReply(reply: unknown): Array<string | Array<string>> {
    return reply as Array<string | Array<string>>;
}
