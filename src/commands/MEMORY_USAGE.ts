import { MemoryUsageOptions, MemoryUsageReply } from "../types";

export function transformArguments(
  key: string,
  options?: MemoryUsageOptions
): Array<string> {
  const args = ["GRAPH.MEMORY", "USAGE", key];
  return options?.SAMPLES ? [...args, String(options.SAMPLES)] : [...args];
}

export declare function transformReply(): MemoryUsageReply;
