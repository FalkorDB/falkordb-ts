import { CommandParser } from '@redis/client';

export const IS_READ_ONLY = true;

export function parseCommand(parser: CommandParser, configKey: string): void {
    parser.push('GRAPH.CONFIG', 'GET', configKey);
}

export function transformArguments(configKey: string): Array<string> {
    return ['GRAPH.CONFIG', 'GET', configKey];
}

type ConfigItem = [
    configKey: string,
    value: number
];

export function transformReply(reply: unknown): ConfigItem | Array<ConfigItem> {
    return reply as ConfigItem | Array<ConfigItem>;
}
