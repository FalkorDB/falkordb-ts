import { ConfigItem } from "../types";

export const IS_READ_ONLY = true;

export function transformArguments(configKey: string): Array<string> {
    return ['GRAPH.CONFIG', 'GET', configKey];
}

export declare function transformReply(): ConfigItem | Array<ConfigItem>;
