import type { RedisClusterType, RedisFunctions, RedisScripts } from '@redis/client';
import type commands from '../commands';

export type ClusterGraphConnection = RedisClusterType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts,
  2
>;
