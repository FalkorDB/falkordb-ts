import type { RedisClientType, RedisFunctions, RedisScripts } from '@redis/client';
import type commands from '../commands';

export type SingleGraphConnection = RedisClientType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts,
  2
>;
