export interface MemoryUsageOptions {
  SAMPLES?: number 
}

export function transformArguments(
  key: string,
  options?: MemoryUsageOptions
): Array<string> {
  const args = ["GRAPH.MEMORY", "USAGE", key];
  return options?.SAMPLES ? [...args, String(options.SAMPLES)] : [...args];
}

export type MemoryUsageReply = Array<string | number | MemoryUsageReply>;

export declare function transformReply(): MemoryUsageReply;
