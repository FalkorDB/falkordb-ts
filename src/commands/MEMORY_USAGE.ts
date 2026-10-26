import { CommandParser } from '@redis/client';
import type { MemoryUsageOptions, MemoryUsageReply } from '../types';

export type { MemoryUsageOptions, MemoryUsageReply };

export function parseCommand(
  parser: CommandParser,
  key: string,
  options?: MemoryUsageOptions
): void {
  parser.push("GRAPH.MEMORY", "USAGE");
  parser.pushKey(key);
  if (options?.SAMPLES !== undefined) {
    parser.push("SAMPLES", String(options.SAMPLES));
  }
}

export function transformArguments(
  key: string,
  options?: MemoryUsageOptions
): Array<string> {
  const args = ["GRAPH.MEMORY", "USAGE", key];
  return options?.SAMPLES !== undefined
    ? [...args, "SAMPLES", String(options.SAMPLES)]
    : args;
}

export function transformReply(reply: unknown): MemoryUsageReply {
    return reply as MemoryUsageReply;
}
