import type { ObservedCacheLookup } from "../../runtime/server/observe/channels";
import { recordedEffects } from "../recorded";
import { expectRecorded } from "./records";

async function expectLookup(helper: string, hit: boolean, key: string, times: number | undefined) {
  const { cacheLookups } = await recordedEffects();

  return expectRecorded(
    helper,
    `a cache ${hit ? "hit" : "miss"} on "${key}"`,
    cacheLookups,
    (lookup) => lookup.key === key && lookup.hit === hit,
    times,
  );
}

/**
 * Asserts that the app read the cache key and found it during the test, and returns the latest such lookup.
 *
 * Sees every read of {@link remember} and {@link cacheGet}. `key` is the exact key that the code gave, with no namespace prefix. Cleared after every test by `@nuxvel/nuxt/testing/setup`. Use {@link expectCacheMiss} for a read that found nothing.
 *
 * @param options.times How many hits there must be, 1 or more.
 *
 * @example
 * ```ts
 * await guest().trpc.post.list();
 * await guest().trpc.post.list();
 * await expectCacheHit("posts:list:[null,null,null]", { times: 1 });
 * ```
 */
export async function expectCacheHit(key: string, options: { times?: number } = {}): Promise<ObservedCacheLookup> {
  return expectLookup("expectCacheHit", true, key, options.times);
}

/**
 * Asserts that the app read the cache key and found nothing during the test, and returns the latest such lookup.
 *
 * It needs a read that missed. A key that nothing read does not pass. See {@link expectCacheHit} for the key rules.
 *
 * @param options.times How many misses there must be, 1 or more.
 *
 * @example
 * ```ts
 * await guest().trpc.post.list();
 * await expectCacheMiss("posts:list:[null,null,null]", { times: 1 });
 * ```
 */
export async function expectCacheMiss(key: string, options: { times?: number } = {}): Promise<ObservedCacheLookup> {
  return expectLookup("expectCacheMiss", false, key, options.times);
}
