# Redis

## Introduction

nuxvel uses one Redis server for queues, cached values, realtime events and the state that nuxvel must keep, such as rate limits and locks. `useRedis()` gives your server code an [ioredis](https://github.com/redis/ioredis) client for that Redis. Use it when you need to keep a value outside the database, for example a counter or a cached result.

## Configuration

```
NUXT_REDIS_URL=redis://localhost:6379
```

Set the Redis URL with `NUXT_REDIS_URL`. In development, `docker compose up -d` starts a Redis container on `localhost:6379`.

Outside production, when `NUXT_REDIS_URL` is not set, nuxvel uses `redis://localhost:6379`. That is the address of the container.

In production (`NODE_ENV=production`), nuxvel does not use a default URL:

- The server does not start without `NUXT_REDIS_URL`.
- `useRedis()` throws `NUXT_REDIS_URL is not set`.
- Commands that run inside the app, such as `nuxvel queue:*`, `nuxvel schedule:list` and `nuxvel schedule:prune`, stop with `NUXT_REDIS_URL: Required in production`.

### A separate Redis for the cache

```
NUXT_REDIS_CACHE_URL=redis://cache:6379
```

Set `NUXT_REDIS_CACHE_URL` to move the `cache` connection to another Redis. Only cached values then live there. The `queue`, `pubsub` and `durable` connections keep `NUXT_REDIS_URL`. When `NUXT_REDIS_CACHE_URL` is not set, the cache uses `NUXT_REDIS_URL`.

In production, give the cache its own Redis. A cache Redis can evict keys under memory pressure. On a shared instance, an eviction can remove queued jobs. `nuxvel doctor` warns when the two share one instance. See [CLI: nuxvel doctor](./cli.md#nuxvel-doctor).

Do not keep state that must stay on the cache connection. A cache Redis can evict it under memory pressure, and a server Redis without persistence loses it on restart. Use `useRedis("durable")` for such state.

### Key prefix

```
NUXT_REDIS_PREFIX=tasks:
```

Set `NUXT_REDIS_PREFIX` to put every key and pub/sub channel of the app under a prefix. Several apps can then share one Redis. With the prefix `tasks:`, the cache key `nuxvel:cache:posts:list` is `tasks:nuxvel:cache:posts:list`, and the BullMQ keys start with `tasks:bull:`. The prefix is empty by default.

`nuxvel app:create` sets the prefix to the app name and allows the app only the keys under it. Build your own keys with `redisKey()`, which adds the prefix:

```ts
await useRedis("cache").set(redisKey("posts:count"), String(count));
```

`redisKey()` is auto-imported on the server.

## Using Redis

```ts
await useRedis("cache").set(redisKey("posts:count"), String(count));

const cached = await useRedis("cache").get(redisKey("posts:count"));
```

Use `useRedis("durable")` for a value that must not be evicted, for example a counter.

To cache the result of a function, use [`remember()`](./cache.md). It adds a key prefix, an expiry time and tags.

`useRedis(purpose)` is auto-imported on the server. It returns a long-lived ioredis client for one purpose. It creates the client on the first call and returns the same client after that. The client opens its connection when you run the first command.

## Connection purposes

| Purpose | Used for |
|---|---|
| `queue` | BullMQ jobs. |
| `cache` | Cached values ([`remember()`](./cache.md)). Reads `NUXT_REDIS_CACHE_URL` when it is set. |
| `durable` | State that Redis must not evict: rate limits, sign-in delays, locks, webhook and idempotency keys, the [maintenance mode](./maintenance.md) state, and flag targeting and experiment state. Always uses `NUXT_REDIS_URL`. |
| `pubsub` | Realtime events. `$channels.x.broadcast()` publishes on it and keeps the replay buffer of each channel there. |

Each purpose has its own connection. They cannot share one. A subscriber connection cannot run other commands. If `queue` and `cache` shared a connection, a blocking queue consumer would make cache reads wait.

Each server process subscribes to realtime events on a separate copy of the `pubsub` connection. This keeps `useRedis("pubsub")` free to publish. To subscribe from your own code, make a copy:

```ts
const subscriber = useRedis("pubsub").duplicate();

await subscriber.subscribe("posts");
```

## Redis outages

When Redis is unreachable, the four connections behave differently:

- A `cache`, `pubsub` or `durable` command fails after one reconnect attempt. The delay between reconnects is 500 ms or less, and each attempt times out after 2 seconds. A request that uses Redis then fails with an error. It does not wait.
- A `queue` command waits until Redis is back, as BullMQ requires.
- Each connection logs the outage one time, at level `error`, with the `redis` tag. It logs again only after the connection recovers and fails again.

Pages continue to render. `GET /api/flags` returns the default value of each flag and the control variant of each experiment. `GET /api/health/ready` returns `503`. See [Health endpoints](./observability.md#health-endpoints).

## See also

- [Cache](./cache.md)
- [Queues](./queues.md)
- [Realtime](./realtime.md)
- [Feature flags](./flags.md)
- [Observability](./observability.md)
