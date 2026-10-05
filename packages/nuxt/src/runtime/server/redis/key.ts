import { useRuntimeConfig } from "nitropack/runtime";

/**
 * The Redis key for `key` under the app's key prefix, `NUXT_REDIS_PREFIX`.
 *
 * Auto-imported on the server. Every key and pub/sub channel nuxvel uses
 * starts with the prefix, so several apps can share one Redis. On a
 * server made by `nuxvel app:create`, Redis refuses the app any key
 * outside its prefix, so build the keys you pass to {@link useRedis} with
 * it. The prefix is empty until `NUXT_REDIS_PREFIX` is set.
 *
 * @example
 * ```ts
 * await useRedis("cache").set(redisKey("posts:count"), String(count));
 * ```
 */
export function redisKey(key: string) {
  return `${useRuntimeConfig().redisPrefix}${key}`;
}
