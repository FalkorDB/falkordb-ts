import { CommandParser } from '@redis/client';

export function parseCommand(parser: CommandParser): void {
    parser.push('GRAPH.UDF', 'FLUSH');
}

export function transformArguments(): Array<string> {
    return ['GRAPH.UDF', 'FLUSH'];
}

export function transformReply(reply: unknown): string {
    return reply as string;
}
