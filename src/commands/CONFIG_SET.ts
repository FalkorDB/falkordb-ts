import { CommandParser } from '@redis/client';

export function parseCommand(parser: CommandParser, configKey: string, value: number | string): void {
    parser.push(
        'GRAPH.CONFIG',
        'SET',
        configKey,
        typeof value === "string" ? value : value.toString()
    );
}

export function transformArguments(configKey: string, value: number | string): Array<string> {
    return [
        'GRAPH.CONFIG',
        'SET',
        configKey,
        typeof value === "string" ? value : value.toString()
    ];
}

export function transformReply(reply: unknown): 'OK' {
    return reply as 'OK';
}
