import { RedisClusterType, RedisFunctions, RedisScripts } from "@redis/client";
import commands from "../commands";

export type ClusterGraphConnection = RedisClusterType<
  { falkordb: typeof commands },
  RedisFunctions,
  RedisScripts
>;