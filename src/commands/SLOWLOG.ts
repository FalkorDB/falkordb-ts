import { CommandParser } from '@redis/client';
import type { SlowLogRawReply, SlowLogReply } from '../types';

export const IS_READ_ONLY = true;

export const FIRST_KEY_INDEX = 1;

export function parseCommand(parser: CommandParser, key: string): void {
    parser.push('GRAPH.SLOWLOG');
    parser.pushKey(key);
}

export function transformArguments(key: string) {
    return ['GRAPH.SLOWLOG', key];
}

export function transformReply(logs: SlowLogRawReply): SlowLogReply {
    return logs.map(([timestamp, command, query, took]) => ({
        timestamp: new Date(Number(timestamp) * 1000),
        command,
        query,
        took: Number(took)
    }));
}
