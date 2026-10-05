import { randomUUID } from "node:crypto";
import { ConflictError } from "../errors/taxonomy";
import { useRedis } from "../redis/client";
import { redisKey } from "../redis/key";
import { redisNamespace as namespace } from "../redis/namespace";
import { windowSeconds } from "../security/rate-limit-window";
import type { CacheTtl } from "./cache";

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0`;

/**
 * Runs `fn` while it holds the lock `key`, then releases the lock and
 * returns the result of `fn`.
 *
 * Auto-imported on the server. Use it so that two requests, jobs or
 * schedule runs do not do the same work at the same time. When a
 * different caller holds the lock, `withLock` does not run `fn` and
 * throws {@link ConflictError} (HTTP 409). The lock is on the `durable`
 * connection of {@link useRedis}. It expires after `ttl`, also when the
 * process stops. Set `ttl` longer than `fn` can run: after `ttl`, a
 * different caller can get the lock while `fn` still runs. The release
 * removes the lock only when this call still holds it.
 *
 * @param ttl Seconds, or a duration such as `{ minutes: 5 }`.
 *
 * @example
 * ```ts
 * const order = await withLock(`checkout:${cart.id}`, 30, () => checkoutAction({ cartId: cart.id }, { actor }));
 * ```
 */
export async function withLock<T>(key: string, ttl: CacheTtl, fn: () => T | Promise<T>): Promise<T> {
  const redis = useRedis("durable");
  const lockKey = redisKey(`${namespace}lock:${key}`);
  const token = randomUUID();
  const milliseconds = (typeof ttl === "number" ? ttl : windowSeconds(ttl)) * 1000;

  if (!(await redis.set(lockKey, token, "PX", milliseconds, "NX"))) {
    throw new ConflictError(`The lock "${key}" is held by a different caller`);
  }

  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE, 1, lockKey, token);
  }
}
