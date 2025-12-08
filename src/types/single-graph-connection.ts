import { RedisClientType, RedisFunctions, RedisScripts } from "@redis/client";
import commands from "../commands";

export type SingleGraphConnection = RedisClientType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts
>;