import { type CacheKey, cacheKeyString } from "../runtime/shared/cache/cache-key";
import { callApp } from "./settled";

/**
 * Asserts that the cache of the app holds a value for `key`, and returns it.
 *
 * It reads the key as stored, and does not record a cache lookup. Use the
 * key that you gave to {@link remember} or {@link cachePut}, a string or
 * an array of parts, without the Redis prefix of the app. Each test
 * starts with an empty cache.
 *
 * @example
 * ```ts
 * await guest().trpc.post.list();
 * const posts = await expectCached<{ rows: Post[] }>("posts:list:[null,null,null]");
 * ```
 */
export async function expectCached<T = unknown>(given: CacheKey): Promise<T> {
  const key = cacheKeyString(given);
  const entry = await callApp<{ value: T } | null | undefined>("cached", { key });
  if (!entry) throw new Error(`expectCached: the cache has no value for "${key}"`);

  return entry.value;
}
