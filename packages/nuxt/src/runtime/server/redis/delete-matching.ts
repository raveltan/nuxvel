import type { Redis } from "ioredis";

export async function deleteMatching(redis: Redis, pattern: string) {
  for await (const keys of redis.scanStream({ match: pattern, count: 500 })) {
    if (keys.length > 0) await redis.del(...keys);
  }
}
