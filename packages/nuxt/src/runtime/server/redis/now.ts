import type { Redis } from "ioredis";

export async function redisNow(redis: Redis) {
  const [seconds = 0, microseconds = 0] = (await redis.time()).map(Number);

  return seconds * 1000 + Math.floor(microseconds / 1000);
}
