import IORedis from "ioredis";
import { config } from "../config";

const redisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  username: config.redis.username || undefined,
  password: config.redis.password || undefined,
  db: config.redis.db,
  maxRetriesPerRequest: null as null,
  enableReadyCheck: true,
};

let sharedConnection: IORedis | null = null;

export function getSharedRedisConnection(): IORedis {
  if (!sharedConnection) {
    sharedConnection = new IORedis(redisOptions);
  }
  return sharedConnection;
}

export function createRedisConnection(): IORedis {
  return new IORedis(redisOptions);
}
