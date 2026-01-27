import { CommandParser } from '@redis/client';

export function parseCommand(parser: CommandParser, srcGraph: string, destGraph: string): void {
    parser.push('GRAPH.COPY', srcGraph, destGraph);
}

export function transformArguments( srcGraph: string, destGraph: string): Array<string> {
    return [
        'GRAPH.COPY',
        srcGraph,
        destGraph
    ];
}

export function transformReply(reply: unknown): 'OK' {
    return reply as 'OK';
}
