# Background, messages, realtime, flags

All names are auto-imported in `server/`. Reach a job, mail, event, notification or channel through its `$` entry and call its method: `$mails.post.published.send(input)`. A wrong name or input fails the typecheck.

## After the commit

Call these inside an action. They run only when the transaction commits, and never after a rollback: `$jobs.x.dispatch`, `$mails.x.send`, `$notifications.x.notify`, `$channels.x.broadcast`, `$events.x.emit` (queued listeners), `sendWebhook`, `sendPush`, `deleteStoredFiles`, `onCommit`. Outside a transaction they run at once. `sendMailNow` and sync listeners do not wait.

## Events

```ts
export const postPublishedEvent = defineEvent({ payload: z.object({ postId: z.number().int() }) });
export const postNotifySubscribersListener = defineListener({
  event: postPublishedEvent,
  handler: async (payload) => { … },
});
await $events.post.published.emit({ postId: post.id });
```

- Listener default: queued after commit. `sync: true`: runs inside the transaction, throw fails the action, no network calls.
- A listener never emits its own event.
- `version` + `upcasters`: change a payload shape safely.

## Jobs

```ts
export const postImportJob = defineJob({
  input: z.object({ postId: z.number() }),
  channel: {},
  async handler({ postId }, { reportProgress }) { … },
});
await $jobs.post.import.dispatch({ postId }, { delay: { minutes: 1 }, priority: 1 });
```

| Option | Meaning |
|---|---|
| `queue` | named queue, default `default` |
| `attempts` | default 3 |
| `backoff` | duration such as `{ seconds: 30 }`, or BullMQ `{ type: "fixed" \| "exponential", delay }` (ms) |
| `timeout` | duration per attempt, such as `{ seconds: 30 }` |
| `unique` | `(input) => key`, skip a dispatch while one with the key waits |
| `limiter` | BullMQ `{ max, duration }` (ms) |
| `channel` | browser can follow progress with `useJobChannel` |

A job has no session. Call actions with `{ actor: systemActor("post.import") }`.

## Schedules

```ts
export const postsPruneDraftsSchedule = defineSchedule({ at: { hour: 3 }, async handler() { … } });
```

`at` fields: `minute`, `hour`, `day`, `weekday` (`"monday"`), `month` (`"january"`). Runs as `systemActor(<name>)` in `queue:work`.

## Mail

```ts
export const postPublishedMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), url: z.url() }),
  subject: ({ title }) => `New post: ${title}`,
  template: "PostPublished",
});
await $mails.post.published.send({ to: user.email, title, url });
```

`template: "PostPublished"` is `server/mail/templates/PostPublished.vue` (Vue + MJML: `<MailLayout>`, `<EText>`, `<EButton>`). Its props are the input without `to`, checked by the typecheck. `render: (props) => h(…)` only for a vnode built by hand. `preview` feeds DevTools, default: a sample of `input`. Mailpit shows dev mail.

## Notifications

```ts
export const postPublishedNotification = defineNotification({
  input: z.object({ postId: z.number(), title: z.string() }),
  via: ["database", "mail", "push"],
  message: ({ postId, title }) => ({ title: "Your post is live", body: title, url: `/posts/${postId}` }),
  mail: $mails.notification,
});
await $notifications.post.published.notify(userId, { postId, title });
```

`message` feeds every channel in `via`: the row, the push, and the input of `mail` (a mail whose input takes `title`, `body`, `url?`, `icon?`). Per channel override: `toDatabase`, `toPush`, `toMail: (input) => ({ mail: $mails.post.published, input: { title } })`. Without `message`, each channel in `via` needs its `to*`. `notify` takes one user id or a list.

## Channels (server-sent events)

```ts
export const postsChannel = defineChannel({
  events: { created: z.object({ id: z.number(), title: z.string() }) },
});
await $channels.posts.broadcast("created", { id, title });
```

- Payloads travel with superjson: a `Date` arrives as a `Date`. Use `z.date()` in the event schema.
- Rooms: `params: ["boardId"]`, then `$channels.board.broadcast("moved", payload, { boardId })`.
- `presence: true` or `presence: { state: z.object(...) }`. Server: `presenceOf(channel, params)`.
- No `authorize` means signed-in users only. `public: true` opens a channel, an upload or a job `channel` to guests.
- `authorize` is a predicate. Use `can(...)` in it (it checks the user of the request), not `authorize()`.

## Uploads

```ts
export const postCoverUpload = defineUpload({
  maxSize: "2 MB", // or bytes; KB = 1024 B
  allowedTypes: ["image/png", "image/jpeg"],
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

Targeting without a deploy: `setFlagTargeting(name, { percentage, roles })`, `./nv flag:set`.

## Cache and locks

- `remember(["posts", "list", input], { minutes: 5 }, fn, { tags: ["posts"] })`, `cacheGet`, `cachePut`, `cacheForget(key)` (`["posts"]` also forgets every key under it), `cacheFlush("posts")`. A key is a string or an array of parts joined with `:`.
- `withLock(key, { seconds: 30 }, fn)`: `ConflictError` when another caller holds it.
- Every duration is an object of `seconds`, `minutes`, `hours`, `days` (`{ days: 7 }`), never a number: cache TTL, lock, `signedUrl` `expiresIn`, job `timeout`, `backoff`, `delay`, rate limit `window`.
- `redisKey(key)`. Not auto-imported: `import { useRedis } from "@nuxvel/nuxt/redis"` (`useRedis(purpose)`), `useS3` from `@nuxvel/nuxt/storage`, `useQueue` from `@nuxvel/nuxt/queue`.

## Other

- Seeder: `export const blogSeeder = defineSeeder(async ({ call }) => { await postFactory.count(5)(); })`. Return lines (`string[]`) to have `db:seed` print them, such as the demo sign-in.
- Backfill: `defineBackfill({ table, batchSize, where, async handler(rows) { … } })`, run with `runBackfill(name)`.
- User data: `export const postsUserData = defineUserData(postTable)` (the owner is its one column to the user table, e.g. `belongsTo(userTable)`; name it otherwise: `defineUserData(postTable, postTable.editorId)`).
- Audit: `audit("post.updated", post, { changes })`. The row's `id` is the target, the name's first segment its type. `{ type, id }` in place of the row sets the type.
