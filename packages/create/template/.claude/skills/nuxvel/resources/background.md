# Background, messages, realtime, flags

All names are auto-imported in `server/`. Each call takes the string name or the `$` entry: `sendMail($mails.post.published, input)`. A wrong name fails the typecheck.

## After the commit

Call these inside an action. They run only when the transaction commits: `dispatchAfterCommit`, `sendMail`, `notify`, `broadcastAfterCommit`, `sendWebhook`, `sendPush`, `deleteStoredFiles`, `onCommit`. Queued listeners also wait. `broadcast` and `sendMailNow` do not wait.

## Events

```ts
export const postPublishedEvent = defineEvent({ payload: z.object({ postId: z.number().int() }) });
export const postNotifySubscribersListener = defineListener({
  event: postPublishedEvent,
  handler: async (payload) => { … },
});
await emit("post.published", { postId: post.id });
```

- Listener default: queued after commit. `sync: true`: runs inside the transaction, throw fails the action, no network calls.
- A listener never emits its own event.
- `version` + `upcasters`: change a payload shape safely.

## Jobs

```ts
export const postImportJob = defineJob({
  input: z.object({ postId: z.number() }),
  channel: { authorize: ({ user }) => user !== null },
  async handler({ postId }, { reportProgress }) { … },
});
await dispatchAfterCommit("post.import", { postId }, { delay: 60_000, priority: 1 });
```

| Option | Meaning |
|---|---|
| `queue` | named queue, default `default` |
| `attempts` | default 3 |
| `backoff` | ms or `{ type: "fixed" \| "exponential", delay }` |
| `timeout` | ms per attempt |
| `unique` | `(input) => key`, skip a dispatch while one with the key waits |
| `limiter` | `{ max, duration }` |
| `channel` | browser can follow progress with `useJobChannel` |

A job has no session. Call actions with `{ actor: systemActor("post.import") }`.

## Schedules

```ts
export const postsPruneDraftsSchedule = defineSchedule({ at: { hour: 3 }, async handler() { … } });
```

`at` fields: `minute`, `hour`, `day`, `weekday` (`"monday"`), `month` (`"january"`). Runs as `systemActor(<name>)` in `queue:work`.

## Mail

```ts
import PostPublished from "./templates/PostPublished.vue";
export const postPublishedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), url: z.url() }),
  subject: ({ title }) => `New post: ${title}`,
  render: (props) => h(PostPublished, props),
});
await sendMail("post.published", { to: user.email, title, url });
```

Template: Vue + MJML. `preview` option feeds DevTools. Mailpit shows dev mail.

## Notifications

```ts
export const postPublishedNotification = defineNotification({
  schema: z.object({ postId: z.number(), title: z.string() }),
  via: ["database", "mail"],
  toDatabase: ({ title }) => ({ title: "Your post is live", body: title, url: "/posts", icon: "i-lucide-newspaper" }),
  toMail: ({ postId, title }) => ({ mail: "post.published", data: { title, url: `/posts/${postId}` } }),
});
await notify(userId, "post.published", { postId, title });
```

`via`: `"database"` (needs `toDatabase`), `"mail"` (`toMail`), `"push"` (`toPush`). `notify` takes one user id or a list.

## Channels (server-sent events)

```ts
export const postsChannel = defineChannel({
  events: { created: z.object({ id: z.number(), title: z.string() }) },
  authorize: ({ user }) => user !== null,
});
await broadcastAfterCommit("posts", "created", { id, title });
```

- Rooms: `params: ["boardId"]`, then `broadcast("board", "moved", payload, { boardId })`.
- `presence: true` or `presence: { state: z.object(...) }`. Server: `presenceOf(channel, params)`.
- `authorize` is a predicate. Use `can(userActor(user), ...)` in it, not `authorize()`.

## Uploads

```ts
export const postCoverUpload = defineUpload({
  maxSize: 2 * 1024 * 1024,
  allowedTypes: ["image/png", "image/jpeg"],
  authorize: ({ user }) => user !== null,
});
const coverKey = await promoteUpload({ upload: "post-cover", key: input.coverKey, to: `covers/${randomUUID()}` });
```

Browser uploads to `tmp/` (deleted after 1 day). An action must `promoteUpload` the key. Options: `svg` (`"reject"`, `"sanitize"`, `"rasterize"`), `rateLimit`. Read: `signedReadUrl(key)` (10 min). Delete: `deleteStoredFiles([key])`.

## Webhooks

```ts
export const billingWebhook = defineWebhook({
  verify: "stripe",
  payload: z.object({ id: z.string(), type: z.string() }),
  handler: async ({ payload }) => { … },
});
```

`verify`: provider name, `hmac({ header, secret: "NUXT_..._SECRET" })` or a function. nuxvel skips a repeat with the same `eventId`. Outbound: `sendWebhook("ticket.created", data)`, `addWebhookEndpoint`.

## Flags and experiments

```ts
export const newEditorFlag = defineFlag({ default: false, expiresAt: "2027-01-01" });
if (await flag("new-editor")) { … }
const variant = await experiment("subscribe-button");
await track("newsletter.subscribed");
```

Targeting without a deploy: `setFlagTargeting(name, { percentage, roles })`, `./nv flags:set`.

## Cache and locks

- `remember("posts:list", { minutes: 5 }, fn, { tags: ["posts"] })`, `cacheGet`, `cachePut`, `cacheForget(key)`, `cacheFlush("posts")`.
- `withLock(key, seconds, fn)`: `ConflictError` when another caller holds it.
- `useRedis(purpose)`, `redisKey(key)`.

## Other

- Seeder: `export const blogSeeder = defineSeeder(async ({ call }) => { await postFactory.count(5)(); })`.
- Backfill: `defineBackfill({ table, batchSize, where, async handler(rows) { … } })`, run with `runBackfill(name)`.
- User data: `export const postsUserData = defineUserData(postTable, postTable.authorId)`.
- Audit: `audit("post.updated", { type: "post", id }, { changes })`.
