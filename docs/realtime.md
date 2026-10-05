# Realtime

## Introduction

Channels send server events to the browser over [server-sent events](https://developer.mozilla.org/docs/Web/API/Server-sent_events). You define each channel in a file, send events with `broadcast()`, and listen from a component with `useChannel()`. Use a channel when a page must show a change without a reload, such as a new post or a new comment. Redis carries the events between server processes.

## Defining a channel

```ts
// server/channels/posts.channel.ts
import { z } from "zod";

export const postsChannel = defineChannel({
  events: {
    created: z.object({ id: z.number(), title: z.string() }),
  },
  authorize: ({ user }) => user !== null,
});
```

Put one channel in each file under `server/channels/`. nuxvel finds the file. You do not register it.

| Option | Use |
|---|---|
| `events` | A Zod schema for each event name that the channel carries. |
| `authorize` | Decides if this connection may listen. It gets the signed-in `user`, or `null` for a guest, and `params`, the params of the room (see [Broadcasting to a room](#broadcasting-to-a-room)). |
| `params` | The param names of the channel's rooms, such as `["boardId"]`. Leave it out for a channel without rooms. |

`events` types the channel from end to end. `broadcast()` and `useChannel()` accept only a channel name that a file defines and an event that the channel declares. A payload with the wrong shape fails `nuxt typecheck`.

### Channel names

The path of the file is the name of the channel. The file above is `posts`, served at `GET /api/channels/posts`. The file `server/channels/post/comments.channel.ts` is `post.comments`.

The auto-imported `$channels` namespace holds each channel under its path. Each path segment is in camelCase and has no kind suffix. `$channels.posts` is the channel in the file above, and `$channels.post.comments` is `post.comments`. Go to definition on `$channels.posts` opens the channel file. `$channels` is also available in the app, where each key holds only the channel name. `useChannel()` and `usePresence()` take it, and no server code goes into the browser bundle.

A name may only hold `a-z`, `0-9`, `.`, `_` and `-`. The build fails for a file whose name has other characters. The build also fails in these cases:

- Two channel files in the same layer have the same name.
- A file is named `flags`. nuxvel defines the `flags` channel itself, for [feature flags](./flags.md).
- A file is named `maintenance`. nuxvel defines the `maintenance` channel itself, for [maintenance mode](./maintenance.md#in-the-app).

### Generating a channel

```bash
nuxvel make:channel post.comments
```

The command writes the channel `postCommentsChannel` at `server/channels/post/comments.channel.ts` and a functional test next to it. See the [CLI reference](./cli.md#generators).

## Authorizing a connection

`authorize` runs before the stream opens. It runs on every connection, and on every reconnect. It also runs again at each `ping` of an open connection.

- At each `ping`, nuxvel looks up the session of the connection again and runs `authorize` again for each channel of the connection. When the session no longer exists, or `authorize` refuses one channel, nuxvel closes the stream. A user who loses access, for example through a role change, stops getting events one heartbeat later at the latest (15 seconds by default).
- The browser then reconnects, and `authorize` runs again. A refused channel is in `refused`, or gets a `403` on `/api/channels/<name>`. The user gets none of the events that they missed.
- When a session ends, nuxvel also closes every stream that the session opened, on every server, at once. A session ends on sign-out, and when a password change revokes it.
- The check does not extend the session. When a session expires, its streams close at the next `ping`.
- `authorize` runs once per channel of each open connection at each `ping`. Keep it fast. When it reads the database, one heartbeat costs one query per channel per connection.

A refused connection gets a `403` and no stream:

```json
{
  "statusCode": 403,
  "statusMessage": "Not allowed to listen to channel \"posts\"",
  "data": { "code": "FORBIDDEN", "message": "Not allowed to listen to channel \"posts\"" }
}
```

An unknown channel name gets a `404` with the code `NOT_FOUND`.

An accepted connection gets an open `text/event-stream`. The first event is `connected`, so the client knows that it is listening. Then a `ping` event comes every 15 seconds, so proxies do not close an idle connection. `useChannel()` ignores `ping`.

A proxy that buffers responses holds these events back. Turn buffering off for `/api/channels`. `nuxvel doctor --url <public URL>` checks that the first event arrives. See [CLI: nuxvel doctor](./cli.md#nuxvel-doctor).

## Broadcasting

```ts
await broadcast("posts", "created", { id: post.id, title: post.title });
```

`broadcast(channel, event, payload)` sends an event to every connection that listens to the channel. It is auto-imported on the server, in `nuxvel queue:work` jobs and in `nuxvel tinker`.

In place of the name, you can give the channel definition, from `$channels` or from an import. Then `event` and `payload` come from that definition. Go to definition on the argument opens the channel file.

```ts
await broadcast($channels.posts, "created", { id: post.id, title: post.title });
```

`payload` has the input type of the event schema. `broadcast()` validates it against the schema first. Async refinements and transforms also run. An invalid payload throws `ValidationFailedError`, the same error a failed action throws. Listeners get the output of the schema.

Each listener gets an unnamed server-sent event. Its `data` is JSON:

```json
{ "event": "created", "payload": { "id": 42, "title": "Hello" } }
```

Its `id` identifies the event for [catching up](#catching-up-after-a-reconnect). When no connection listens to the channel, only the replay buffer keeps the event.

### Broadcasting to a room

A room is one channel with one value for each of its params. Name the params in the channel definition:

```ts
// server/channels/board.channel.ts
export const boardChannel = defineChannel({
  events: { moved: z.object({ cardId: z.number() }) },
  params: ["boardId"],
  authorize: async ({ user, params }) => user !== null && (await canViewBoard(user, Number(params.boardId))),
});
```

Give the params as the last argument to send to one room:

```ts
await broadcast("board", "moved", { cardId: card.id }, { boardId: card.boardId });
await broadcastAfterCommit($channels.board, "moved", { cardId: card.id }, { boardId: card.boardId });
```

- Only the listeners of that room get the event. The room `board` with `{ boardId: 7 }` has the key `board?boardId=7`.
- `params` must have each name in the channel's `params`, and no other name. A wrong name fails `nuxt typecheck`. A value is a string or a number.
- A broadcast without `params` goes to the listeners of the channel itself, as before. It does not go to a room.
- `authorize` runs for each room. It gets the room's params as strings, such as `{ boardId: "7" }`. When a room holds data that only some users may see, check `params` in `authorize`.
- A room whose param names are not the channel's `params` does not exist. The server refuses it, as it refuses a channel that no file defines.
- Each room has its own [replay buffer](#catching-up-after-a-reconnect).

`useChannel()` and `useLiveQuery()` listen to a room with the same `params`. See [Listening from a component](#listening-from-a-component).

### Dates in payloads

```ts
const isoDate = z.date().transform((date) => date.toISOString());

export const postsChannel = defineChannel({
  events: {
    created: z.object({ id: z.number(), title: z.string(), createdAt: isoDate }),
  },
  authorize: ({ user }) => user !== null,
});
```

The payload is plain JSON, not superjson as in tRPC responses. A `Date` arrives as an ISO string. Put that conversion in the schema, and the listener type matches what arrives.

### Broadcasting from any process

```ts
// server/jobs/post/publish.job.ts
export const postPublishJob = defineJob({
  input: z.object({ id: z.number(), title: z.string() }),
  handler: async ({ id, title }) => {
    await broadcast("posts", "created", { id, title });
  },
});
```

`broadcast()` publishes through Redis with `useRedis("pubsub")`. It reaches the connections of every server process that uses the same Redis. The caller can be a request handler, a job in `nuxvel queue:work`, or `nuxvel tinker`. See [Redis](./redis.md).

`broadcast()` resolves when Redis has the event. Each server then writes the event to its own connections.

### Broadcasting after the commit

```ts
await broadcastAfterCommit("posts", "created", { id: post.id, title: post.title });
```

`broadcast()` does not wait for a transaction. In an action, it sends the event before the action commits. When the write then rolls back, listeners already know about a write that does not exist. Use `broadcastAfterCommit()` in an action. It takes the same arguments as `broadcast()`, and sends the event only after the write commits.

- It validates the payload at the call. A wrong payload throws in the transaction, so the transaction rolls back.
- Outside a transaction, it sends the event immediately.
- A send that fails after the commit does not fail the transaction. nuxvel logs the error, as for an [`onCommit()`](./database.md#after-the-commit) hook.

## Catching up after a reconnect

Each broadcast has an `id`. Redis keeps the last 500 events of each channel, and of each room of a channel. A channel's buffer expires 24 hours after its last broadcast. The buffer of a presence room expires two ping intervals after its last event. A reconnect gets a new `presence.sync`, so the room does not need a longer buffer. A client can reconnect with a `Last-Event-ID` header. It then gets the events that it missed first, in order and with no duplicates. Then it gets new events.

The browser's `EventSource` sends that header itself after a dropped connection, so `useChannel()` needs nothing more.

- A connection without the header starts with new events only.
- A connection with a header that is not an event ID also starts with new events only.
- A client that missed more than 500 events on the channel gets only the last 500. Before them, it gets a `resync` event.
- A client whose last event is older than the channel's buffer also gets `resync`. This occurs when the buffer expired, and also when the buffer expired and then started again with new broadcasts. The buffer expires 24 hours after the last broadcast on the channel.
- A client that got no event of the channel yet gets an event ID that holds the time of its join. It gets `resync` only when it reconnects 24 hours or more after that time. On a channel with no broadcast in that time, this `resync` is not needed, but it is harmless.
- A client whose last event ID is `0-0` gets no `resync` when the buffer expired.

### The resync event

```json
{ "channel": "posts" }
```

`resync` tells the client that events are missing. The replay buffer no longer holds all the events that the client missed. The event comes before the events that the buffer still holds, on both endpoints. Its data names the channel.

`useLiveQuery()` refetches its query when its channel gets `resync`. `useChannel()` ignores `resync`. Its `events` then has a gap.

When a server loses its Redis connection, it ends its open streams. Each browser reconnects and catches up in the same way.

## Listening from a component

```vue
<script setup lang="ts">
const { events, close } = useChannel("posts");
</script>

<template>
  <ul>
    <li v-for="(message, index) in events" :key="index">
      {{ message.event }}: {{ message.payload.title }}
    </li>
  </ul>
  <UButton color="neutral" variant="outline" label="Stop listening" @click="close" />
</template>
```

`useChannel(name)` is auto-imported. It joins the channel when the component mounts, and leaves it when the component unmounts. It does nothing during SSR. In place of the name, it also takes the channel from `$channels`, for example `useChannel($channels.posts)`. Then `events` gets its type from that channel definition.

- `events` holds every broadcast received, oldest first, as `{ event, payload }`. It is typed by the channel's `events`. When you narrow on `message.event`, `message.payload` gets the output type of that event schema. The server validated the payload before it sent it.
- `events` keeps the newest 100 messages and drops older ones. A page that stays open does not use more and more memory. Pass `useChannel("posts", { limit: 20 })` to keep a different number.
- `close()` stops listening. Nothing received after it goes into `events`.
- `status` is the state of the shared connection: `connecting`, `open`, `reconnecting` or `closed`. It is `closed` before the component mounts and after `close()`.
- `params` listens to one room of the channel, for example `useChannel("board", { params: { boardId: 7 } })`. Then `events` gets only the broadcasts to that room. See [Broadcasting to a room](#broadcasting-to-a-room). On a presence channel, this is the room that `usePresence()` joins, so a signed-in user becomes a member. The presence events do not go into `events`.

```vue
<script setup lang="ts">
const { status } = useChannel("posts");
</script>

<template>
  <UBadge v-if="status === 'reconnecting'" color="warning" label="Reconnecting" />
</template>
```

A channel that refuses the connection, or that no file defines, stays empty. See [One connection per tab](#one-connection-per-tab).

## Updating a query from a channel

A query that follows a channel does not need `useChannel()` and a manual refetch. `useLiveQuery()` changes the query's cache entry from the channel's events, or fetches the query again. See [Live lists](./frontend.md#live-lists). Add `params` to follow one room:

```ts
const cards = useLiveQuery(trpc.card.list.queryOptions({ boardId }), {
  channel: "board",
  params: { boardId },
  refetch: { moved: true },
});
```

## One connection per tab

All `useChannel()` calls on a page share one `EventSource` on `GET /api/channels?channels=<json>`. The `channels` parameter is a URL-encoded JSON list:

```json
[{ "name": "posts" }, { "name": "post.comments", "lastEventId": "1727170000000-0" }]
```

A page that listens to five channels uses one connection. Browsers allow only a few connections for each host. Each broadcast arrives on the connection as the named event `channel:<name>`. `useChannel()` gives it to the components that listen to that channel.

### The connected event

```json
{ "connectionId": "…", "channels": ["posts"], "refused": ["post.comments"] }
```

nuxvel authorizes each channel in the query separately. The first event is `connected`, with the data above.

- `channels` lists the channels that the connection now listens to.
- `refused` lists the unknown and unauthorized channels. The connection does not fail. It drops these channels.
- `GET /api/channels` ignores a channel name longer than 256 characters.

`useChannel()` does not try a refused channel again on the same connection. It tries again when the connection opens again. A user who gets access during a session sees the channel after the next reconnect.

### Joining and leaving

A component that mounts later joins over the open connection with `POST /api/channels/join`. The body is `{ connectionId, channel, lastEventId }`. When the component unmounts, it leaves with `POST /api/channels/leave` and the body `{ connectionId, channel }`. Leaving stops the events of that channel only.

| Status | `data.code` | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | The body is malformed, or the channel name is longer than 256 characters. |
| `403` | `FORBIDDEN` | `authorize` refuses. Join only. |
| `404` | `NOT_FOUND` | No channel has that name. Join only. |
| `429` | `TOO_MANY_REQUESTS` | The `channel-join` rate limit refuses. Join, and the open of `GET /api/channels`. |
| `409` | `CONFLICT` | No server holds the connection now. |

The errors use the [route-error shape](./api.md#errors). After a `409`, the browser opens the connection again with all its channels.

Any server can answer a join or a leave. The request goes through Redis to the process that holds the stream, so a load balancer does not need sticky sessions. Events broadcast after the join answers are delivered. This is also true when they go out before the holding process subscribes.

### Reconnecting

When the connection drops, `useChannel()` opens it again after a random delay. It sends every joined channel and the ID of the last event seen on each. Each channel then [catches up](#catching-up-after-a-reconnect). To test this, see [Listening in a test](#listening-in-a-test).

The first delay is between 0 and 1 second. Each failed attempt doubles the upper bound, up to 30 seconds. A `connected` event sets the bound back to 1 second. Because the delay is random, the clients of a restarted server do not all reconnect at the same time.

A server that shuts down ends its open streams first. Its clients then reconnect to another server, or to the same server when it is back.

### Limits

```ts
export default defineNuxtConfig({
  nuxvel: {
    realtime: { maxConnections: 5 },
  },
});
```

`realtime.maxConnections` is the number of connections that one signed-in user can keep open. For a guest, the count is per IP address. The default is 20. Each server process counts its own connections. Set `NUXT_NUXVEL_REALTIME_MAX_CONNECTIONS` to change it at runtime.

A connection over the limit gets a `429` with the code `TOO_MANY_REQUESTS` and a `Retry-After` header. The limit applies to `GET /api/channels` and `GET /api/channels/<name>`. A closed connection frees its place.

`POST /api/channels/join` also has a limit: the built-in `channel-join` rate limit, 60 joins per minute. Over it, a join gets a `429` with a `Retry-After` header. See [Security: the channel-join limit](./security.md#the-channel-join-limit).

A connection listens to at most 20 channels at the same time. `GET /api/channels` refuses the channels after the first 20. They appear in `refused` in the `connected` event.

A `POST /api/channels/join` that would make a 21st channel gets a `200`, but the connection does not join the channel. The stream then sends the event `refused` with the data `{ "channel": "<name>" }`. After a leave, the connection can join a different channel again.

Each channel of a `GET /api/channels` open also counts against the `channel-join` limit. Past it, the open gets a `429` with a `Retry-After` header, and `useChannel()` tries again after its backoff delay.

`POST /api/channels/presence` has a limit of 120 updates per minute for each user. Over it, an update gets a `429` with a `Retry-After` header.

### The single-channel endpoint

`GET /api/channels/<name>` is for clients that do not use `useChannel()`. Its first event is also `connected`, with `{}` as its data. Each broadcast arrives as a plain `message` event.

## Presence

Presence shows which signed-in users are on a page now, and what each one shares, such as a typing flag. You turn it on for a channel. Each set of params, such as one post, has its own room of members.

### Turning on presence

```ts
// server/channels/posts.channel.ts
import { z } from "zod";

export const postsChannel = defineChannel({
  events: {
    created: z.object({ id: z.number(), title: z.string() }),
  },
  authorize: ({ user }) => user !== null,
  presence: { state: z.object({ typing: z.boolean() }) },
});
```

| Option | Use |
|---|---|
| `presence: true` | Tracks who listens. Members share no state. |
| `presence: { state }` | Also lets each member share a state. `state` is a Zod object. |

A member's state starts empty, as `{}`. Each update merges into it and is validated against the `state` schema, with every field optional.

### Rooms

A room is one channel with one set of params, as in [Broadcasting to a room](#broadcasting-to-a-room). `posts` with `{ id: 42 }` is the room `posts?id=42`. A connection joins a room in the same way that it joins a channel. A presence channel without `params` accepts a room with any params. The channel's `authorize` runs for each room. It gets the room's params in `params`, as strings: the room `posts?id=42` gives `{ id: "42" }`. When a room holds data that only some users may see, check `params` in `authorize`. Otherwise, every user that `authorize` allows can join every room, see its members and receive its events.

```ts
authorize: async ({ user, params }) => user !== null && (await canViewPost(user, Number(params.id))),
```

Guests can listen to a room, but only signed-in users become members.

A user with several tabs open is one member. The member's `connections` counts the tabs. The member leaves when the last tab leaves.

### Members

```ts
const viewers = await presenceOf("posts", { id: post.id });
```

`presenceOf(channel, params)` returns the members of one room. It is auto-imported on the server, in `nuxvel queue:work` jobs and in `nuxvel tinker`. It accepts only a channel that sets `presence`. It also takes the channel definition, for example `presenceOf($channels.posts, { id: post.id })`.

| Field | Value |
|---|---|
| `userId` | The ID of the user. |
| `name` | The name of the user. |
| `avatar` | The `image` of the user, set by server code or a social provider. Not set when the user has none. |
| `state` | What the member shares, typed by the `state` schema. |
| `connections` | The number of the user's tabs in the room. |

### In a component

`usePresence("posts", { id })` or `usePresence($channels.posts, { id })` joins a room from a component. It returns the members and a `setState()` for the current user. See [Frontend: presence](./frontend.md#presence).

### Presence events

nuxvel sends these events when the members of a room change:

| Event | When |
|---|---|
| `presence.sync` | This connection joins the room. Only this connection gets it. |
| `presence.join` | A user opens the first tab in the room. |
| `presence.update` | A member opens or closes one more tab, or changes the state. |
| `presence.leave` | A member's last tab leaves, or its connection expires. |

`presence.sync` has the payload `{ members }`, the full list of members when the connection joins. It is not kept for replay. The other events go to every listener in the room. Their payload is `{ userId, member }`, where `member` is the member that changed, after the change. A `presence.leave` payload is `{ userId }`. A client starts from `presence.sync` and applies each change in order. Thus, each change sends one member to each listener, not the full list. A reconnect gets a new `presence.sync`, so a gap in the replay does not change the member list.

### Updating the state

`POST /api/channels/presence` changes the state of the signed-in member. The body is `{ connectionId, channel, state }`. `channel` is the room, such as `posts?id=42`. `usePresence()` sends it for you.

| Status | `data.code` | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | The body is malformed, the channel name is longer than 256 characters, or `state` fails the schema. |
| `401` | `UNAUTHORIZED` | Nobody is signed in. |
| `403` | `FORBIDDEN` | The connection is not a member of that room, or belongs to another user. |
| `404` | `NOT_FOUND` | No channel with presence has that name. |
| `429` | `TOO_MANY_REQUESTS` | The user sent more than 120 updates in one minute. |

### Heartbeat

The `ping` event of each connection is also its presence heartbeat. Each ping keeps the connection's membership alive for two more intervals. When a server stops without a clean leave, its members expire. The next ping of another member of the room removes them and broadcasts `presence.leave`.

Set `NUXVEL_REALTIME_HEARTBEAT_SECONDS` to change the interval. The default is 15 seconds. A shorter interval removes members faster and sends more pings. It also re-checks access more often, at the cost of more session lookups.

## Custom event streams

```ts
// server/api/posts/[id]/summary.get.ts
export default defineStreamHandler({
  authorize: ({ user }) => user !== null,
  handler: async (stream, event) => {
    for await (const token of summarize(getRouterParam(event, "id"))) {
      await stream.push({ event: "token", data: token });
    }
  },
});
```

`defineStreamHandler()` is auto-imported on the server. Use it for a route that streams its own events to one client, such as the tokens of an AI answer. Use a channel when many clients follow the same events. In the example, `summarize()` is your own function.

| Option | Use |
|---|---|
| `authorize` | Decides if this request may open the stream. It gets the signed-in `user`, or `null` for a guest. A refusal gets a `403`. |
| `handler` | Writes the events. It gets the stream and the request's `H3Event`. |

`stream.push()` sends one event. It takes `{ data, event?, id? }`, or a string as the `data` of an unnamed event. `stream.onClosed(callback)` runs the callback when the stream ends. Use it to stop work when the client leaves.

The stream ends when `handler` resolves. When `handler` throws, nuxvel logs the error and ends the stream. The stream also gets the behavior of a channel connection:

- A `ping` event every 15 seconds, or every `NUXVEL_REALTIME_HEARTBEAT_SECONDS`.
- The [connection limit](#limits).
- The stream ends when the server shuts down, or when the session that opened it ends.

## Deploys

During a [blue-green deploy](./deploy.md#deploying), the old server processes keep their realtime connections open after the switch. At the start of the hold, the deploy sends them `SIGUSR2`. A server under pm2 then closes each open connection at a random moment within 30 seconds, or within `NUXVEL_REALTIME_DRAIN_SECONDS`, and keeps serving. The browser reconnects to the new release and [catches up](#catching-up-after-a-reconnect) on the events it missed. The random delays spread the reconnects, so the new release does not get them all at once. Outside pm2, the server does not handle `SIGUSR2`.

## Following a job

```ts
// server/jobs/post/import.job.ts
export const postImportJob = defineJob({
  channel: { authorize: ({ user }) => user !== null },
  input: z.object({ rows: z.number() }),
  handler: async ({ rows }, { reportProgress }) => {
    for (let row = 0; row < rows; row += 1) {
      await importRow(row);
      await reportProgress(Math.round(((row + 1) / rows) * 100));
    }
    return { imported: rows };
  },
});
```

The `channel` option gives a job a channel. Each run broadcasts on the channel of the user who dispatched it, `job:<name>:<userId>`. Only that user may listen, and `authorize` must also allow them, as in `defineChannel()`. A run with no user behind it, for example from a schedule or a system actor, broadcasts on `job:<name>`, and `authorize` alone decides who may listen. The handler reports its progress with `reportProgress(percent)`, from its second argument. nuxvel broadcasts each report on the job's channel. A job without `channel` broadcasts nothing.

```vue
<script setup lang="ts">
const { events } = useJobChannel("post.import");
const latest = computed(() => events.value.at(-1));
</script>

<template>
  <progress v-if="latest?.event === 'progress'" :value="latest.payload.percent" max="100" />
  <p v-else-if="latest?.event === 'completed'">Imported {{ latest.payload.result.imported }}</p>
</template>
```

`useJobChannel(name)` follows the job from a component. Every message is typed. It accepts only the name of a job that has a `channel`. It also takes the job from `$jobs`, for example `useJobChannel($jobs.post.import)`. In the app, `$jobs` holds only the name of each job. `useJobChannel()` listens to the channel of the signed-in user, so it shows only the runs that this user dispatched. Signed out, it listens to `job:<name>`.

| Event | Payload | When |
|---|---|---|
| `progress` | `{ percent }` | The handler calls `reportProgress()`. |
| `completed` | `{ result }` | The handler returns. `result` is its return value, or `null`. |
| `failed` | `{ message }` | The last retry throws, or the job fails immediately, for example with an invalid payload. `message` is generic unless the error is a taxonomy error. See [Queues](./queues.md). |

Read the latest message, as above. Do not walk through all of `events`. Like `useChannel()`, `useJobChannel()` keeps only the newest 100 messages, and `limit` changes that number.

These broadcasts are best effort. When one fails, nuxvel logs and reports the error. The job does not fail and does not retry because of it.

The channel is for the job name, not for one run. Every run of the job reports on the same channel, to every user that `authorize` lets in. Dispatch such a job one run at a time. Or broadcast your own event with a value that identifies each run. See [Queues](./queues.md).

## Testing

```ts
import { expect, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("post.comments channel", () => {
  it("refuses a guest", async () => {
    await expect(guest().listen("post.comments")).rejects.toBeTrpcError("FORBIDDEN");
  });
});
```

`nuxvel make:channel` generates this test. It tests the channel's `authorize` against the running app. See [Testing](./testing.md).

### Listening in a test

```ts
const stream = await actingAs(user).listen(`tasks?projectId=${project.id}`);

await runJob("task.create", { projectId: project.id });

expect(await stream.next()).toMatchObject({ event: "created" });
```

`client.listen(channels)` opens a channel stream as the client, which is `actingAs()` or `guest()`. It takes a channel name in the server form, such as `"tasks?projectId=1"`, or an array of names. It resolves after the `connected` event to `{ channels, refused, next(), close() }`. `channels` and `refused` list what the app accepted and refused. `next()` resolves to the next `{ id, event, payload }` of an accepted channel and skips `ping`. `id` is the event ID. It rejects after 5 seconds with no event.

A room of a presence channel, such as `"tasks?projectId=1"`, also sends `presence.sync`, `presence.join`, `presence.leave` and `presence.update` in no fixed order with the broadcasts. Pass an event name, `next("created")`, to skip every event with another name. The name is typed by the events of the channel, and by the `presence.*` names.

When the app accepts none of the channels, `listen` rejects with `FORBIDDEN`, or `NOT_FOUND` when the channel does not exist. `toBeTrpcError` matches both. The end of the test closes the stream. `expectBroadcast` stays the way to check that the app broadcast. Use `listen` to test who may listen and that a broadcast arrives.

To test a reconnect, pass `{ lastEventId }` as the second argument. `listen` then sends it as the `Last-Event-ID` header for each channel, as a browser does, and the stream replays the events after it:

```ts
const first = await actingAs(user).listen("tasks");

await runJob("task.create", { projectId: project.id });
await runJob("task.create", { projectId: project.id });

const { id } = await first.next();

first.close();

const again = await actingAs(user).listen("tasks", { lastEventId: id });

expect(await again.next()).toMatchObject({ event: "created" });
```

To see every channel, whether a guest can listen, and its replay buffer, run `nuxvel channels`. See the [CLI reference](./cli.md#nuxvel-channels).

### Testing broadcasts

```ts
await runJob("post.publish", { id: post.id });

await expectBroadcast("posts", "updated", { id: post.id });
await expectNotBroadcast("posts", "deleted");
await expectBroadcast("board", "moved", { cardId: card.id }, { params: { boardId: board.id } });
```

`expectBroadcast(channel, event, match?, { times?, params? })` checks that the app broadcast `event` on the channel with a payload that has the `match` fields, and returns it. The event name, `match` and `params` are typed by the channel. With `params`, only a broadcast to that room counts. Without it, a broadcast to any room counts. It also takes the channel definition or its stub from `$channels`. A `broadcastAfterCommit()` counts once its transaction commits. `expectNotBroadcast(channel, event?, { params? })` checks that the app did not broadcast, on the channel or, with `event`, that event, or, with `params`, to that room.

### Testing presence

```ts
const member = await expectPresent("posts", { id: post.id }, user);

expect(member.connections).toBe(1);
```

`expectPresent(channel, params, user)` checks that the user is a member of the room, and returns the member. It also takes the channel definition or its stub from `$channels` in `#nuxvel/test-namespaces`. Open the page in a browser test first, so that a connection joins the room. `expectNotPresent(channel, params, user)` checks that the user is not a member. See [Testing](./testing.md#asserting-on-presence).

## See also

- [Frontend: live lists](./frontend.md#live-lists)
- [Database: after the commit](./database.md#after-the-commit)
- [Queues](./queues.md)
- [Redis](./redis.md)
- [Feature flags](./flags.md)
- [Maintenance mode](./maintenance.md)
- [Frontend: presence](./frontend.md#presence)
- [Notifications](./notifications.md#the-notification-channel)
