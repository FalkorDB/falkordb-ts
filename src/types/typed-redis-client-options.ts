import type { RedisClientOptions, RedisFunctions, RedisScripts } from 'redis';
import type { RedisClusterOptions } from '@redis/client';
import type commands from '../commands';

export type TypedRedisClientOptions = RedisClientOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts, 2>;
export type TypedRedisClusterClientOptions = RedisClusterOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts, 2>;
