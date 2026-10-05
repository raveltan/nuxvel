# Cache

## Introduction

The cache keeps the result of slow work in Redis for a set time. Use it for a value that many requests read and few requests change, such as the list of published posts. [Locks](#locks) use the `durable` connection, which does not evict keys. The cache helpers and `withLock()` are auto-imported on the server.

## Remembering values

```ts
// server/trpc/routers/post.router.ts
export const postRouter = {
  list: publicProcedure.output(z.array(postSchema)).query(() =>
    remember("posts:list", { minutes: 5 }, () => useDb().select().from(postTable)),
  ),
};
```

`remember(key, ttl, fn)` returns the cached value of `key`. When the key is missing or expired, it runs `fn`, stores the result for `ttl` and returns it. The return type is the return type of `fn`.

```ts
list: publicProcedure
  .input(paginationSchema.optional())
  .output(
    z.object({
      rows: z.array(postSchema),
      page: z.number(),
      perPage: z.number(),
      total: z.number(),
      lastPage: z.number(),
    }),
  )
  .query(({ input }) =>
    remember(`posts:list:${JSON.stringify([input?.page, input?.perPage, input?.q])}`, { minutes: 5 }, () =>
      paginate(useDb().select().from(postTable).$dynamic(), input),
    ),
  ),
```

When the result depends on the input, put the input in the key. Each page and each search then has its own cached value. The glob `posts:*` removes all of them, see [Invalidation](#invalidation).

`ttl` is a number of seconds, or a duration with the same units as a [rate limit window](./security.md#rate-limiting): `seconds`, `minutes`, `hours` and `days`. The units add up, so `{ hours: 1, minutes: 30 }` is 90 minutes.

Values go through [superjson](https://github.com/flightcontrolhq/superjson). A `Date`, `Map`, `Set` or `BigInt` reads back as the same type.

### Reading and writing directly

```ts
await cachePut("posts:count", count, { minutes: 5 });

const cached = await cacheGet<number>("posts:count");
```

`cachePut(key, value, ttl)` stores a value and replaces the value that was there. `cacheGet(key)` returns the value, or `undefined` when the key is missing or expired.

### Keys

nuxvel adds the prefix `nuxvel:cache:` to each key in Redis, after the [app's key prefix](./redis.md#key-prefix). The key `posts:list` is `nuxvel:cache:posts:list` in Redis. The values use the `cache` connection of [`useRedis()`](./redis.md#connection-purposes). Set `NUXT_REDIS_CACHE_URL` to keep the cache on a separate Redis. See [A separate Redis for the cache](./redis.md#a-separate-redis-for-the-cache).

In a test server, the prefix is `nuxvel:test<n>:cache:`, where `<n>` is the Vitest pool id. Tests do not read or remove the values of a development server that uses the same Redis.

## Invalidation

```ts
await cacheForget("posts:list");
```

`cacheForget(key)` removes one value. The next `remember()` for that key runs its function again.

```ts
await cacheForget("posts:*");
```

A key with `*`, `?` or `[` is a Redis glob. `cacheForget()` then finds the matching keys with `SCAN` and removes each one.

### Invalidating from an action

```ts
export const createPostAction = defineAction({
  input: createPostInput,
  invalidates: ["posts:*"],
  handler: async (input, ctx) => {
    const post = await useDb()
      .insert(postTable)
      .values({ title: input.title, body: input.body, authorId: ctx.actor.id })
      .returning()
      .then(firstOrFail);

    return post;
  },
});
```

The `invalidates` option of `defineAction()` lists keys or globs. After the transaction of the action commits, the action removes them with `cacheForget()`. When the handler throws, the transaction rolls back and the action removes nothing.

### Tags

```ts
const post = await remember(`posts:${id}`, { hours: 1 }, () => findOrFail(postTable, id), {
  tags: ["posts"],
});

await cacheFlush("posts");
```

The `tags` option of `remember()` and `cachePut()` adds the key to one or more tags. `cacheFlush(tag)` removes every value with that tag. A value that has no tag stays.

### Seeding

`nuxvel db:seed`, `nuxvel db:fresh --seed` and the `runSeeder()` fixture remove every cached value after the seeders commit, as `cacheForget("*")` does. See [Seeding](./database.md#seeding).

## Transactions

```ts
export const showPostAction = defineAction({
  input: z.object({ id: z.number() }),
  handler: ({ id }) => remember(`posts:${id}`, { hours: 1 }, () => findOrFail(postTable, id)),
});
```

An action runs in a database transaction. Inside a transaction, `remember()` stores a missing value only after the transaction commits. When the transaction rolls back, the cache does not keep the value. It uses [`onCommit()`](./database.md#after-the-commit) for this.

`cachePut()` and `cacheForget()` do their work immediately, also inside a transaction. To remove a value only after the commit, use `onCommit()`:

```ts
await onCommit(() => cacheForget("posts:list"));
```

## Locks

```ts
export const checkoutRouter = {
  pay: authedProcedure
    .input(z.object({ cartId: z.number() }))
    .output(orderSchema)
    .mutation(({ input, ctx }) =>
      withLock(`checkout:${input.cartId}`, 30, () => checkoutAction(input, { actor: ctx.actor })),
    ),
};
```

`withLock(key, ttl, fn)` runs `fn` only while it holds the lock `key`. Then it releases the lock and returns the result of `fn`. Use it when two requests, jobs or schedule runs must not do the same work at the same time. Examples are a checkout that the user clicks two times, or a schedule run that is still busy when the next run starts.

When a different caller holds the lock, `withLock()` does not run `fn`. It throws a `ConflictError` (HTTP 409). See [Errors](./api.md#errors).

The lock is a Redis key on the `durable` connection of [`useRedis()`](./redis.md#connection-purposes), with the prefix `nuxvel:lock:`. `ttl` has the same format as the cache `ttl`. The lock expires after `ttl`, also when the process stops before the release. Set `ttl` longer than `fn` can run. When `fn` runs longer than `ttl`, a different caller can get the lock while `fn` still runs. The release removes the lock only when this call still holds it.

## DevTools

```
posts:list miss
posts:list hit
```

In development, each `remember()` and `cacheGet()` call adds a `cache:lookup` line to the timeline of the request, job or command. The line shows the key and `hit` or `miss`. See [DevTools](./devtools.md#requests).

## Testing

```ts
import { actingAs, expectCacheHit, expectCacheMiss, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "../../server/factories/users.factory";

describe("post list", () => {
  it("reads the posts again after a new post", async () => {
    const key = `posts:list:${JSON.stringify([undefined, undefined, undefined])}`;

    await guest().trpc.post.list();
    await guest().trpc.post.list();

    await expectCacheMiss(key, { times: 1 });
    await expectCacheHit(key, { times: 1 });

    await actingAs(await userFactory()).trpc.post.create({ title: "Hello", body: "World" });
    await guest().trpc.post.list();

    await expectCacheMiss(key, { times: 2 });
  });
});
```

`expectCacheHit(key, { times? })` checks that the app read the key and found it. `expectCacheMiss(key, { times? })` checks that the app read the key and found nothing. A key that nothing read passes neither. `key` is the exact key that `remember()` or `cacheGet()` got, with no prefix. Each returns the latest matching lookup.

To count the queries instead, use `expectConstantQueries(fn, [1])`. A read from the cache runs no query.

`expectCached(key)` asserts that the cache of the app holds a value for the key, and returns the value. It does not count as a cache read.

```ts
await guest().trpc.post.list();
const posts = await expectCached("posts:list:[null,null,null]");
```

`@nuxvel/nuxt/testing/setup` removes the values that the test server stored, and the cached pages of routes with the `cached` [rendering preset](./rendering.md). It does this before the first test of a file and after every test. Each test starts with an empty cache, and a test that opens a `cached` page sees the data that the test made.

## See also

- [Redis](./redis.md)
- [Database](./database.md#after-the-commit)
- [Rendering](./rendering.md): cache a full page with the `cached` preset
- [API](./api.md): the client-side query cache
