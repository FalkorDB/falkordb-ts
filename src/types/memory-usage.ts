export interface MemoryUsageOptions {
  SAMPLES?: number
}

export type MemoryUsageReply = Array<string | number | MemoryUsageReply>;
