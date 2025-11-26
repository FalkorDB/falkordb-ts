import commands from '../commands';
import {
  RedisClusterOptions,
  RedisClientOptions,
  RedisFunctions,
  RedisScripts
} from 'redis';

export type TypedRedisClientOptions = RedisClientOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;
export type TypedRedisClusterClientOptions = RedisClusterOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;
