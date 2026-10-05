import { randomUUID } from "node:crypto";
import { useRedis } from "../redis/client";
import { deleteMatching } from "../redis/delete-matching";
import { redisKey } from "../redis/key";
import { redisNamespace } from "../redis/namespace";
import { now } from "../clock/now";

const consumeScript = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1] - ARGV[2])
local count = redis.call("ZCARD", KEYS[1])
local allowed = count < tonumber(ARGV[3])
if allowed then
  redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
  count = count + 1
end
local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
return {allowed and 1 or 0, tonumber(ARGV[3]) - count, tonumber(oldest[2]) + ARGV[2] - ARGV[1]}
`;

let consumedSinceReset = false;

export async function consumeAttempt(key: string, points: number, duration: number) {
  consumedSinceReset = true;
  const windowMs = duration * 1000;
  // ioredis types an eval reply as unknown; the script above fixes its shape.
  const [allowed, remaining, resetMs] = (await useRedis("durable").eval(
    consumeScript,
    1,
    redisKey(`${redisNamespace}rate-limit:${key}`),
    now().getTime(),
    windowMs,
    points,
    randomUUID(),
  )) as [number, number, number];
  const reset = Math.max(1, Math.ceil(resetMs / 1000));

  return allowed
    ? { allowed: true as const, remaining, reset }
    : { allowed: false as const, remaining: 0, reset, retryAfter: reset };
}

export async function forgetRateLimits() {
  if (!consumedSinceReset) return;

  consumedSinceReset = false;
  await deleteMatching(useRedis("durable"), redisKey(`${redisNamespace}rate-limit:*`));
}
