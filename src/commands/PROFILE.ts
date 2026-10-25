import { CommandParser } from '@redis/client';
import { withParamsHeader } from '.';
import type { PlanOptions } from '../types';

export const FIRST_KEY_INDEX = 1;

// PROFILE executes the query, which may write
export const IS_READ_ONLY = false;

export function parseCommand(parser: CommandParser, key: string, query: string, options?: PlanOptions): void {
    parser.push('GRAPH.PROFILE');
    parser.pushKey(key);
    parser.push(withParamsHeader(query, options?.params));
}

export function transformArguments(key: string, query: string, options?: PlanOptions): Array<string> {
    return ['GRAPH.PROFILE', key, withParamsHeader(query, options?.params)];
}

export function transformReply(reply: unknown): Array<string> {
    return reply as Array<string>;
}
