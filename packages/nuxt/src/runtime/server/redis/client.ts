import { envHint } from "../../shared/env/env-hints";
import { Redis } from "ioredis";
import { useRuntimeConfig } from "nitropack/runtime";
import { useLogger } from "../logging/logger";

/** What a Redis connection is used for, one connection per purpose. */
export type RedisPurpose = "queue" | "cache" | "pubsub" | "durable";

const clients = new Map<RedisPurpose, Redis>();

function redisUrl(purpose: RedisPurpose) {
  const config = useRuntimeConfig();

  if (purpose === "cache" && config.redisCacheUrl) return config.redisCacheUrl;

  const url = config.redisUrl;

  if (url) return url;
  if (process.env.NODE_ENV === "production") throw new Error(`NUXT_REDIS_URL is not set. ${envHint("NUXT_REDIS_URL")}`);

  return "redis://localhost:6379";
}

function retryOptions(purpose: RedisPurpose) {
  // BullMQ refuses a connection that gives up on a command, because its blocking reads outlive any retry budget
  if (purpose === "queue") return { maxRetriesPerRequest: null };

  return {
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    retryStrategy: (attempt: number) => Math.min(attempt * 50, 500),
  };
}

function logOncePerOutage(client: Redis, purpose: RedisPurpose) {
  let logged = false;

  client.on("ready", () => {
    logged = false;
  });
  client.on("error", (error) => {
    if (logged) return;
    logged = true;
    useLogger("redis").error(`the ${purpose} connection failed, retrying`, error);
  });
}

/**
 * The app's Redis client for one purpose, created once and reused.
 *
 * Auto-imported on the server. Reads `NUXT_REDIS_URL`; outside
 * production it connects to `redis://localhost:6379` when that is unset,
 * and in production it throws instead. The `cache` purpose reads
 * `NUXT_REDIS_CACHE_URL` when it is set, so cached values can live on a
 * separate Redis that evicts keys. Each purpose gets
 * its own connection because they cannot share one: a `pubsub`
 * subscriber can issue no other command, and a blocking `queue` consumer
 * would stall `cache` reads behind it.
 *
 * The connection is lazy — it is opened on the first command, not here.
 * While Redis is unreachable, a `cache`, `pubsub` or `durable` command rejects after
 * one reconnect attempt (reconnects are at most 500 ms apart and each
 * times out after 2 s) rather than waiting for Redis to come back; a
 * `queue` command waits, as BullMQ requires. A lost connection is logged
 * once, at `error`, until it is back.
 *
 * @param purpose Which connection to return: `queue` for BullMQ, `cache`
 * for cached values, `pubsub` for publishing realtime events (it is what
 * `broadcast()` publishes on; subscribe on `useRedis("pubsub").duplicate()`
 * so this connection stays free to publish), `durable` for state that must
 * not be evicted, such as rate limits, locks, maintenance mode and flag
 * targeting (always `NUXT_REDIS_URL`).
 *
 * @example
 * ```ts
 * await useRedis("cache").set(redisKey("posts:count"), String(count));
 * ```
 */
export function useRedis(purpose: RedisPurpose) {
  let client = clients.get(purpose);

  if (!client) {
    client = new Redis(redisUrl(purpose), { lazyConnect: true, ...retryOptions(purpose) });
    logOncePerOutage(client, purpose);
    clients.set(purpose, client);
  }

  return client;
}

export async function quitRedis(client: Redis) {
  if (client.status === "wait") client.disconnect();
  else if (client.status !== "end") await client.quit();
}

export async function closeRedis() {
  const closing = [...clients.values()];

  clients.clear();
  await Promise.all(closing.map(quitRedis));
}
