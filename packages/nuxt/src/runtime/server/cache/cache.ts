import superjson from "superjson";
import { onCommit } from "../database/transaction";
import { publishObserved } from "../observe/channels";
import { type CacheKey, cacheKeyString, escapeGlob } from "../../shared/cache/cache-key";
import { useRedis } from "../redis/client";
import { deleteMatching } from "../redis/delete-matching";
import { redisKey } from "../redis/key";
import { redisNamespace as namespace } from "../redis/namespace";
import { type RateLimitWindow, windowSeconds } from "../security/rate-limit-window";

export type { CacheKey } from "../../shared/cache/cache-key";

/** How long a cached value lives: seconds, or a duration such as `{ minutes: 5 }`. */
export type CacheTtl = number | RateLimitWindow;

/** Options for {@link remember} and {@link cachePut}. */
export interface CacheOptions {
  /** Tags that {@link cacheFlush} forgets the value by. */
  tags?: string[];
}

let storedSinceReset = false;

function keyOf(key: string) {
  return redisKey(`${namespace}cache:${key}`);
}

function tagOf(tag: string) {
  return redisKey(`${namespace}cache-tag:${tag}`);
}

function seconds(ttl: CacheTtl) {
  return typeof ttl === "number" ? ttl : windowSeconds(ttl);
}

async function lookup(given: CacheKey) {
  const key = cacheKeyString(given);
  const value = await useRedis("cache").get(keyOf(key));

  publishObserved("cache:lookup", { key, hit: value !== null });

  return value;
}

export async function cachedEntry(key: string): Promise<{ value: unknown } | undefined> {
  const value = await useRedis("cache").get(keyOf(key));

  return value === null ? undefined : { value: superjson.parse(value) };
}

/**
 * Reads a cached value, or `undefined` when the key is missing or expired.
 *
 * Auto-imported on the server. `key` is a string or an array of parts,
 * see {@link CacheKey}. See {@link remember} to compute a missing value
 * and {@link cachePut} to store one.
 */
export async function cacheGet<T = unknown>(key: CacheKey): Promise<T | undefined> {
  const value = await lookup(key);

  return value === null ? undefined : superjson.parse<T>(value);
}

/**
 * Stores `value` under `key` for `ttl`, replacing what was there.
 *
 * Auto-imported on the server. `key` is a string or an array of parts,
 * see {@link CacheKey}. The value goes through superjson, so a
 * `Date`, `Map`, `Set` or `BigInt` reads back as the same type. It
 * stores at once, also inside a transaction: use {@link remember} for a
 * value read from the database.
 *
 * @param ttl Seconds, or a duration such as `{ minutes: 5 }`.
 * @param options.tags Tags that {@link cacheFlush} forgets the value by.
 *
 * @example
 * ```ts
 * await cachePut(["posts", "count"], count, { minutes: 5 });
 * ```
 */
export async function cachePut(given: CacheKey, value: unknown, ttl: CacheTtl, options: CacheOptions = {}) {
  const key = cacheKeyString(given);
  const expiresIn = seconds(ttl);
  const write = useRedis("cache").multi().set(keyOf(key), superjson.stringify(value), "EX", expiresIn);

  for (const tag of options.tags ?? []) {
    write.sadd(tagOf(tag), keyOf(key)).expire(tagOf(tag), expiresIn, "NX").expire(tagOf(tag), expiresIn, "GT");
  }

  storedSinceReset = true;
  await write.exec();
}

/**
 * Returns the cached value of `key`, or runs `fn`, caches its result for
 * `ttl` and returns it. The result type is inferred from `fn`.
 *
 * Auto-imported on the server. `key` is a string or an array of parts,
 * see {@link CacheKey}: put the input of the work in it, such as
 * `["posts", "list", input]`. Inside a transaction, such as an action,
 * a miss stores the value only after the transaction commits
 * ({@link onCommit}): a rolled-back transaction caches nothing. The
 * value goes through superjson, like {@link cachePut}. Forget it with
 * {@link cacheForget} or, by tag, {@link cacheFlush}.
 *
 * @param ttl Seconds, or a duration such as `{ minutes: 5 }`.
 * @param options.tags Tags that {@link cacheFlush} forgets the value by.
 *
 * @example
 * ```ts
 * const list = await remember(["posts", "list", input], { minutes: 5 }, () => paginate(useDb().select().from(postsTable).$dynamic(), input), {
 *   tags: ["posts"],
 * });
 * ```
 */
export async function remember<T>(
  key: CacheKey,
  ttl: CacheTtl,
  fn: () => T | Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const cached = await lookup(key);

  if (cached !== null) return superjson.parse<T>(cached);

  const value = await fn();

  await onCommit(() => cachePut(key, value, ttl, options));

  return value;
}

/**
 * Forgets cached values: for an array key, the value of the key and of
 * every key that starts with it; for a string, the value of the key, or
 * of every key that matches a glob such as `posts:*`.
 *
 * Auto-imported on the server. `["posts"]` forgets `posts`,
 * `posts:list` and `posts:list:{"page":1}`, and not `postscript`; the
 * parts are matched as they are, so a `*` in a part is no glob. A
 * string key with `*`, `?` or `[` is a Redis glob, matched with `SCAN`.
 * It forgets at once, also inside a transaction: wrap it in
 * {@link onCommit} to wait for the commit, or give an action
 * `invalidates`, see {@link defineAction}.
 *
 * @example
 * ```ts
 * await cacheForget(["posts"]);
 * await cacheForget("posts:*");
 * ```
 */
export async function cacheForget(key: CacheKey) {
  const redis = useRedis("cache");

  if (typeof key !== "string") {
    const prefix = cacheKeyString(key);

    await redis.del(keyOf(prefix));
    await deleteMatching(redis, keyOf(`${escapeGlob(prefix)}:*`));
    return;
  }

  if (!/[*?[]/.test(key)) {
    await redis.del(keyOf(key));
    return;
  }

  await deleteMatching(redis, keyOf(key));
}

/**
 * Forgets every cached value stored with `tag`.
 *
 * Auto-imported on the server. Tag a value with the `tags` option of
 * {@link remember} or {@link cachePut}.
 *
 * @example
 * ```ts
 * await cacheFlush("posts");
 * ```
 */
export async function cacheFlush(tag: string) {
  const redis = useRedis("cache");
  const keys = await redis.smembers(tagOf(tag));

  await redis.del(tagOf(tag), ...keys);
}

export async function forgetStoredCache() {
  if (!storedSinceReset) return;

  storedSinceReset = false;
  await deleteMatching(useRedis("cache"), redisKey(`${namespace}cache*`));
}
