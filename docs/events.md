# Domain events

## Introduction

An event records that something happened in your app, for example "a post was published". An action emits the event, and listeners react to it. Use events when one change must start work in other parts of the app, and the action must not know about that work.

## Defining an event

```sh
nuxvel make:event post.published post_id:integer
```

`nuxvel make:event` writes the event and a functional test next to it. The fields after the name go into the `payload` schema. See [CLI: fields](./cli.md#fields). The command above writes `server/events/post/published.event.ts`:

```ts
// server/events/post/published.event.ts
import { z } from "zod";

export const postPublishedEvent = defineEvent({
  payload: z.object({
    postId: z.number().int(),
  }),
});
```

The test, `published.event.test.ts`, emits the event with a sample value for each field, here `{ postId: 1 }`, and checks it with `expectEmitted`. Without fields, the payload schema is empty.

Put each event in its own file under `server/events/`, as a named export. `defineEvent` is auto-imported. nuxvel finds the file. You do not register it. Import the event where you listen for it.

The file path gives the event name. The file above defines the event `post.published`. `nuxvel event:list` prints this name, and the test fixtures take it. See [Names come from paths](./index.md#names-come-from-paths).

The auto-imported `$events` namespace holds each event under its path. Each path segment is in camelCase and has no kind suffix. `$events.post.published` is the event in the file above. Go to definition on `$events.post.published` opens the event file. `$events` is available on the server only.

### Checking a payload

```ts
await postPublishedEvent.parse({ postId: "nope" });
```

nuxvel checks the payload against the `payload` schema on every emit. The schema can use async refinements and transforms. A wrong payload fails at the emit, not inside a listener.

`parse` runs the same check. A payload that fails it rejects with a `ValidationFailedError`, the same error that an action throws. The error has the code `BAD_REQUEST` and the failed fields in `fields`. Over HTTP, the client gets the usual [validation error shape](./validation.md#error-shape).

## Defining a listener

```sh
nuxvel make:listener post.notify-subscribers --event post.published
```

The event must exist first. The command writes a queued listener and a functional test that proves the event queues it. The test emits the event with the sample payload from the test of the event. When the event has no test with a sample payload, the test emits `{}`. If the payload schema refuses `{}`, the test does not compile. Then write a valid payload in the test.

The listener:

```ts
// server/listeners/post/notify-subscribers.listener.ts
import { postPublishedEvent } from "#server/events/post/published.event";

export const postNotifySubscribersListener = defineListener({
  event: postPublishedEvent,
  handler: async (payload) => {
    console.log("post.notify-subscribers", payload);
  },
});
```

Replace the `console.log` with the work of the listener:

```ts
// server/listeners/post/notify-subscribers.listener.ts
import { postPublishedEvent } from "#server/events/post/published.event";

export const postNotifySubscribersListener = defineListener({
  event: postPublishedEvent,
  handler: async ({ postId }) => {
    await notifySubscribers(postId);
  },
});
```

Put each listener in its own file under `server/listeners/`, as a named export. `defineListener` is auto-imported. nuxvel finds the file. You do not register it.

The file path gives the listener name. The file above defines the listener `post.notify-subscribers`. `nuxvel event:list` and the test fixtures use this name.

The auto-imported `$listeners` namespace holds each listener in the same way. `$listeners.post.notifySubscribers` is the listener in the file above. A `renamed()` alias is not in the namespace. `$listeners` is available on the server only.

The handler gets the payload after the event schema parses it. Its type is the schema's output type.

A listener does not emit the event that it listens to. The listener would run again for its own emit. `nuxvel test:arch` reports this loop.

### Queued listeners

A listener is queued by default. When the action emits the event, nuxvel writes an outbox row in the action's transaction. After the commit, the relay in `nuxvel queue:work` puts the row on the queue. The worker then runs the handler.

- When the transaction rolls back, nuxvel writes no row, and the listener does not run.
- The queued job has the name `listener:<name>`, for example `listener:post.notify-subscribers`.
- When a queued listener throws, the worker retries it like a job. See [Failures and retries](./queues.md#failures-and-retries).

### Sync listeners

```ts
// server/listeners/post/count-published.listener.ts
import { postPublishedEvent } from "#server/events/post/published.event";

export const postCountPublishedListener = defineListener({
  event: postPublishedEvent,
  sync: true,
  handler: async ({ postId }) => {
    await incrementPublishedCount(postId);
  },
});
```

With `sync: true`, the listener runs immediately, inside the transaction of the emitting action. `emit` waits for it. The writes of the listener commit or roll back with the writes of the action. When the listener throws, the action fails.

A sync listener does not make network calls, such as `$fetch` or `sendMailNow`. [`nuxvel test:arch`](./cli.md#nuxvel-testarch) reports them. Use a queued listener for that work.

## Emitting an event

```ts
// server/actions/posts/publish-post.action.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const publishPostAction = defineAction({
  input: z.object({ id: z.number() }),
  handler: async ({ id }) => {
    const post = await updateOne(postTable, id, { publishedAt: new Date() });

    await $events.post.published.emit({ postId: post.id });

    return post;
  },
});
```

`$events` holds every event of `server/events/`, keyed by its path in camelCase, and is auto-imported on the server. Call `emit()` from the action that made the change. It checks the payload first, then runs each listener of the event:

- A sync listener runs immediately, in the transaction. Its writes commit or roll back with the action.
- A queued listener goes on the queue after the transaction commits. When the transaction rolls back, it never runs. Outside a transaction it goes on the queue immediately.

`emit()` takes a payload of the input type of the payload schema. Each listener gets the output type. A wrong payload does not compile. Go to definition on `published` opens the event file.

### Schemas that transform

When the payload schema coerces or transforms values, each listener parses the payload from the value that you gave to `emit()`. So the transform runs once for each listener:

- A sync listener parses the payload in the emitting transaction.
- A queued listener's job carries the raw payload. The listener parses it when it runs.

## Versioning a payload

```ts
// server/events/post/published.event.ts
export const postPublishedEvent = defineEvent({
  version: 2,
  upcasters: { 1: (old) => ({ postId: (old as { id: number }).id }) },
  payload: z.object({ postId: z.number() }),
});
```

A queued listener's payload waits in the outbox and on the queue. It can stay there while you deploy a new payload shape. When you change the payload schema, increase `version` and add an upcaster. Events use the same versions as [jobs](./queues.md#payload-versions).

| Option | Meaning |
|---|---|
| `version` | The version that `payload` describes. The default is 1. |
| `upcasters` | Keyed by the version that a payload was written under. Each upcaster returns the payload in the shape of the next version. |
| `payload` | The Zod schema for the current version. |

Before the handler of a queued listener runs, nuxvel upcasts a payload from an older version. Then it parses the payload with the current schema. `nuxvel queue:versions` shows the queued payloads for each version, and flags a version that has no upcaster.

## Renaming a listener

```ts
// server/listeners/notify-subscribers.listener.ts
import { postNotifySubscribersListener } from "./post/notify-subscribers.listener";

export default renamed(postNotifySubscribersListener);
```

When you move a listener file, the listener gets a new name. Runs that are already queued wait under the old name, `listener:<old name>`. Keep the old file as a `renamed()` alias until those runs finish. See [Renaming a definition](./index.md#renaming-a-definition).

An event stores nothing under its name. You can move an event file without an alias.

## Listing events

```sh
nuxvel event:list
```

```
EVENT           SOURCE                                 EMITTED BY                                   LISTENERS
post.archived   server/events/post/archived.event.ts   nothing                                      none
post.published  server/events/post/published.event.ts  server/actions/posts/publish-post.action.ts  post.notify-subscribers (queued)
▲ post.archived has no listener, nothing reacts to this event
```

The command lists each event, the server files that emit it and its listeners. It warns about an event that has no listener. `--json` prints the same data as JSON. See the [CLI reference](./cli.md#nuxvel-eventlist).

## Testing

```ts
// server/events/post/published.event.test.ts
import { describe, emit, expectEmitted, expectListenerQueued, expectListenerRan, it } from "@nuxvel/nuxt/testing";
import { postFactory } from "#nuxvel/factories";

describe("post.published event", () => {
  it("runs its listeners", async () => {
    const post = await postFactory();

    await emit("post.published", { postId: post.id });

    await expectEmitted("post.published", { postId: post.id });
    await expectListenerRan("post.count-published");
    await expectListenerQueued("post.notify-subscribers");
  });
});
```

`emit(name, payload)` emits the event in the app, inside a transaction, as an action does. Sync listeners run before it resolves. Queued listeners go to the queue fake after the commit. `expectEmitted` sees an event only after the transaction commits, so `expectNotEmitted` passes for an emit in a rolled-back transaction. A payload that fails the schema rejects with a `BAD_REQUEST` validation error.

| Fixture | Checks |
|---|---|
| `expectEmitted(name, match?)` | `emit()` ran for the event, with payload fields that match. |
| `expectNotEmitted(name, match?)` | `emit()` did not run for the event with such a payload. |
| `expectListenerRan(name)` | The sync listener with that name ran. |
| `expectListenerQueued(name)` | The queued listener with that name reached the queue. It relays the outbox first. |

A queued listener runs in the `nuxvel queue:work` process, not in the app under test. So `expectListenerRan` sees sync listeners only. To test what a queued listener does, run its handler with `runListener(name, payload)`:

```ts
await runListener("post.notify-subscribers", { postId: post.id });
```

The listener name is typed from `server/listeners/`. The payload is not typed, but the event's schema parses it. An invalid payload rejects with a `BAD_REQUEST` validation error.

The event name is typed from `server/events/`, and the `match` fields are typed by the output of the payload schema. A misspelled event name fails to compile.

Each fixture also takes the event or listener definition, or its name stub, in place of the name. A test file imports the stubs from `#nuxvel/test-namespaces`. With an event definition, `payload` has the input type of its schema, and `match` has the output type.

```ts
import { $events, $listeners } from "#nuxvel/test-namespaces";

await emit($events.post.published, { postId: post.id });
await expectListenerQueued($listeners.post.notifySubscribers);
```

See [Testing](./testing.md).

## See also

- [Actions](./actions.md)
- [Queues](./queues.md)
- [Testing](./testing.md)
- [CLI](./cli.md)
