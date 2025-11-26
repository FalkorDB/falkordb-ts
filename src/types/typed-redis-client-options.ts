import { RedisClusterOptions, RedisClientOptions } from '@redis/client';
import { RedisFunctions, RedisScripts } from 'redis';
import commands from '../commands';

export type TypedRedisClientOptions = RedisClientOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;
export type TypedRedisClusterClientOptions = RedisClusterOptions<{ falkordb: typeof commands }, RedisFunctions, RedisScripts>;
