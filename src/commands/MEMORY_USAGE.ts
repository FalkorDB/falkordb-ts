import { CommandParser } from '@redis/client';

export interface MemoryUsageOptions {
  SAMPLES?: number 
}

export function parseCommand(
  parser: CommandParser,
  key: string,
  options?: MemoryUsageOptions
): void {
  parser.push("GRAPH.MEMORY", "USAGE", key);
  if (options?.SAMPLES) {
    parser.push(String(options.SAMPLES));
  }
}

export function transformArguments(
  key: string,
  options?: MemoryUsageOptions
): Array<string> {
  const args = ["GRAPH.MEMORY", "USAGE", key];
  return options?.SAMPLES ? [...args, String(options.SAMPLES)] : [...args];
}

export type MemoryUsageReply = Array<string | number | MemoryUsageReply>;

export function transformReply(reply: unknown): MemoryUsageReply {
    return reply as MemoryUsageReply;
}
