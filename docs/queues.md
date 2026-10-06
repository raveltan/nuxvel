# Queues

## Introduction

A job is work that runs in the background, outside the request. For example, a job tells the followers of an author about a new post. A separate worker process runs the jobs from a BullMQ queue on [Redis](./redis.md). Schedules run work on a clock, and tasks run one-off work that you start by hand.

## Defining a job

```sh
nuxvel make:job post.notify-followers post_id:integer
```

`nuxvel make:job` writes the job and a functional test next to it. The fields after the name go into the `input` schema. See [CLI: fields](./cli.md#fields). The command above writes `server/jobs/post/notify-followers.job.ts`:

```ts
// server/jobs/post/notify-followers.job.ts
import { z } from "zod";

export const postNotifyFollowersJob = defineJob({
  input: z.object({
    postId: z.number().int(),
  }),
  handler: async (input) => {
    console.log("post.notify-followers", input);
  },
});
```

The test, `notify-followers.job.test.ts`, runs the job with `runJob` and a sample value for each field, here `{ postId: 1 }`. Without fields, the `input` schema is empty. A job that takes no payload can leave `input` out. It then takes `{}` or `undefined`.

Replace the `console.log` with the work of the job:

```ts
// server/jobs/post/notify-followers.job.ts
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const postNotifyFollowersJob = defineJob({
  input: z.object({
    postId: z.number().int(),
  }),
  handler: async ({ postId }) => {
    const post = await findOrFail(postTable, postId);

    await notifyFollowers(post);
  },
});
```

Put each job in its own file under `server/jobs/`, as a named export. `defineJob` is auto-imported. nuxvel finds the file. You do not register it.

The file path gives the job name. The file above defines the job `post.notify-followers`. You dispatch the job by this name. See [Names come from paths](./index.md#names-come-from-paths).

The auto-imported `$jobs` namespace holds each job definition under its path. Each path segment is in camelCase and has no kind suffix. `$jobs.post.notifyFollowers` is the definition in the file above, and `$jobs.post.notifyFollowers.name` is `"post.notify-followers"`. Go to definition on `$jobs.post.notifyFollowers` opens the job file. `$jobs` is also available in the app, where each key holds only the job name, for `useJobChannel()`. A `renamed()` alias is not in the namespace.

Before the handler runs, nuxvel validates the payload with the `input` schema. The schema can use async refinements and transforms. A payload that fails throws the same `ValidationFailedError` that an action throws. See [Validation](./validation.md).

### Reporting progress

```ts
// server/jobs/post/import-comments.job.ts
import { z } from "zod";

export const postImportCommentsJob = defineJob({
  channel: { authorize: ({ user }) => user !== null },
  input: z.object({ postId: z.number(), rows: z.number() }),
  async handler({ postId, rows }, { reportProgress }) {
    for (let row = 0; row < rows; row += 1) {
      await importComment(postId, row);
      await reportProgress(Math.round(((row + 1) / rows) * 100));
    }

    return { imported: rows };
  },
});
```

A job with a `channel` option broadcasts each run on the channel of the user who dispatched it: `job:<name>:<userId>`, here `job:post.import-comments:<userId>`. Only that user can listen, and `authorize` must also allow them. A run with no user behind it, for example from a schedule or a system actor, broadcasts on `job:<name>`, and `authorize` alone decides who can listen. The channel gets these events:

| Event | Payload | When |
|---|---|---|
| `progress` | `{ percent }` | The handler calls `reportProgress(percent)`. |
| `completed` | `{ result }` | The handler returns. `result` is the return value, or `null`. |
| `failed` | `{ message }` | The last attempt throws, or the job fails without a retry. |

`message` is the message of a taxonomy error, for example `Invalid input` for a `ValidationFailedError`. For every other error it is `Something went wrong`, as over HTTP, so SQL and parameters never reach the browser. The log and error tracking keep the real error.

A component follows the job with `useJobChannel()`. See [Following a job](./realtime.md#following-a-job).

A job without a `channel` broadcasts nothing, and `reportProgress` does nothing. When a broadcast fails, nuxvel logs the error and reports it to error tracking. A failed broadcast does not fail the job and does not cause a retry.

## Dispatching

```ts
// server/actions/posts/publish-post.action.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const publishPostAction = defineAction({
  input: z.object({ id: z.number() }),
  handler: async ({ id }) => {
    const post = await updateOne(postTable, id, { publishedAt: new Date() });

    await $jobs.post.notifyFollowers.dispatch({ postId: post.id });

    return post;
  },
});
```

`$jobs.<name>.dispatch(payload)` queues the job after the surrounding transaction commits. When the transaction rolls back, the job is not queued. `$jobs` holds every job of `server/jobs/`, keyed by its path in camelCase: `server/jobs/post/notify-followers.job.ts` is `$jobs.post.notifyFollowers`. It is auto-imported on the server.

An action already runs in a transaction. In other server code, open one with `transaction()`:

```ts
await transaction(async () => {
  const post = await insertOne(postTable, input);

  await $jobs.post.notifyFollowers.dispatch({ postId: post.id });
});
```

Outside a transaction, `dispatch()` writes the outbox row immediately. See [The outbox](#the-outbox).

`payload` has the input type of the job's `input` schema, so a wrong payload fails `nuxt typecheck`. A job without `input` takes no payload: `$jobs.post.reindexAll.dispatch()`. Go to definition on `notifyFollowers` opens the job file.

### Delay and priority

```ts
await $jobs.post.sendDigest.dispatch({ postId: post.id }, { delay: 60_000 });
await $jobs.post.notifyFollowers.dispatch({ postId: post.id }, { priority: 1 });
```

The second argument takes BullMQ job options. Both are optional:

| Option | Meaning |
|---|---|
| `delay` | Milliseconds that the job waits in the delayed set before a worker can run it. A whole number from 0 to 2147483647, about 24 days. The wait starts when the relay adds the job to the queue. |
| `priority` | A whole number from 1 to 2097152. A job with a lower number runs first. A job with no priority runs before all jobs that have one. |

A value out of range throws, and nuxvel writes nothing. The options type is `DispatchOptions`.

### The dispatcher

A job runs as the actor that dispatched it. `dispatch()` stores the current actor with the payload: the actor of the running action or procedure, else the API key or session of the request. The handler runs as that actor, so `useAuth()` in the job returns it and its user. The handler also gets it as `dispatcher` in its second argument:

```ts
export const postArchiveJob = defineJob({
  input: z.object({ postId: z.number() }),
  async handler({ postId }, { dispatcher }) {
    const { user } = await useAuth();

    await archivePost(postId, { by: user?.id ?? null, actorType: dispatcher?.type ?? null });
  },
});
```

To run the job as a different actor, set the `dispatcher` option. `null` runs the job as nobody:

```ts
await $jobs.post.reindex.dispatch({ postId: post.id }, { dispatcher: systemActor("reindex") });
await $jobs.post.reindex.dispatch({ postId: post.id }, { dispatcher: null });
```

A job dispatched with no actor present runs as nobody: `dispatcher` is `null` and `useAuth()` returns `{ user: null, actor: null }`. `runJob` in a test runs the job as nobody, or as a user with `{ actingAs: user }`. Queued listeners and schedule ticks have no dispatcher.

### Named queues

```ts
// server/jobs/post/build-report.job.ts
import { z } from "zod";

export const postBuildReportJob = defineJob({
  queue: "reports",
  input: z.object({ postId: z.number() }),
  async handler({ postId }) {
    await buildReport(postId);
  },
});
```

A job goes on the queue that its `queue` option names. A job without the option goes on the `default` queue. The built-in `nuxvel.mail` and `nuxvel.notification` jobs go on the `mail` queue. The built-in `nuxvel.push` job goes on the `push` queue. The built-in `nuxvel.webhook` job goes on the `webhooks` queue. The built-in `nuxvel.billing.process-event` job goes on `default`. Queued listeners and schedule ticks go on `default`.

Put slow work on its own queue. Then a long report does not delay the mail. See [Running jobs](#running-jobs) to run only some queues.

In BullMQ, the `default` queue is named `nuxvel`. Another queue is named `nuxvel-<queue>`, for example `nuxvel-mail`.

`useQueue(name?)` returns the BullMQ `Queue` of a queue, `default` when you give no name. Use it only to inspect or manage a queue directly:

```ts
const failed = await useQueue().getFailed();
const waitingMail = await useQueue("mail").getWaiting();
```

## The outbox

`dispatch()` does not write to Redis. It writes a row to the `outbox` table, in your transaction. A new app has this table in `server/database/schema/outbox.schema.ts`.

| Column | Contents |
|---|---|
| `id` | A `serial` key. |
| `job_name` | The dispatched job name. |
| `payload` | The payload, its version and its dispatcher, as `jsonb`. See [Payload versions](#payload-versions) and [The dispatcher](#the-dispatcher). |
| `delay` | The `delay` option in milliseconds, or `null`. |
| `priority` | The `priority` option, or `null`. |
| `dispatched_at` | `null` until the row reaches the queue. |

The worker relays the outbox when a transaction that wrote a row commits, and also every second. Each relay takes up to 100 rows that have no `dispatched_at`, adds them in order to the queue of each job and sets `dispatched_at`.

`dispatch()` sends a Postgres `NOTIFY` on the channel `nuxvel_outbox` in the same transaction. Postgres delivers it at the commit, and not after a rollback. The worker listens on that channel, so a job usually reaches the queue a few milliseconds after the commit. The one-second relay stays as a fallback, for example while the worker reconnects to Postgres. When the worker cannot listen at startup, it logs a `warn` line with the tag `outbox` and relays every second only. The partial index `outbox_undispatched_idx` covers only the rows that have no `dispatched_at`. The lookup stays fast when many dispatched rows collect in the table.

So the queue always agrees with the database:

- A rollback leaves no row.
- When the process stops between the commit and the enqueue, nothing is lost. The next relay finds the row.

More than one worker can relay at the same time. A relay locks its rows with `select ... for update skip locked`. Two relays never enqueue the same row, and one relay does not wait for the other.

When a relay stops between the enqueue and the update of `dispatched_at`, the next relay enqueues the row again. So a handler must be safe to run two times.

### Pruning the outbox

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    queue: { outboxRetention: "30 days" },
  },
});
```

The built-in schedule `nuxvel.prune-outbox` runs every day at 04:30. It deletes the `outbox` rows whose `dispatched_at` is older than `nuxvel.queue.outboxRetention`. The value is a Postgres interval. The default is `"7 days"`. A row that has not reached the queue stays. When the relay puts a row on the queue, it clears the `payload` of the row. The row keeps its job name and `dispatched_at` until the prune deletes it.

The built-in schedule `nuxvel.auth.reencrypt-two-factor` runs every day at 04:15. After `nuxvel key:rotate NUXT_AUTH_SECRET`, it encrypts the two-factor secrets again with the new secret. See [Auth](./auth.md#rotating-the-auth-secret).

```ts
const deleted = await pruneOutbox("1 day");
```

`pruneOutbox(after?)` deletes the old rows now and returns how many it deleted. It is auto-imported on the server. Without an argument, it uses `outboxRetention`.

### Relaying by hand

```ts
const relayed = await relayOutbox();
```

`relayOutbox()` relays the outbox immediately and returns the number of rows that it relayed. It is auto-imported on the server. Call it only when the rows must reach the queue now. A functional test does not need it: `expectQueued` relays for you. See [Testing](#testing).

## Running jobs

In development, `nuxvel dev` runs the worker inside the dev server, so jobs, listeners and schedules run and reload with your code. Pass `--no-queue` to start the dev server without it. See [the CLI](./cli.md#nuxvel-dev).

If the worker cannot start in development, the dev server logs the error and continues to serve the app. Save a file to try again. Outside development, a worker that cannot start stops the server with exit code 1.

Outside `nuxvel dev`, start the worker yourself:

```sh
nuxvel queue:work
nuxvel queue:work --concurrency 10
nuxvel queue:work --queue mail,default
```

`nuxvel queue:work` runs the worker. The worker is part of the app's Nitro server. The command builds the server and starts it with `NUXVEL_ROLE=worker`. See [the CLI](./cli.md#nuxvel-queuework).

`--concurrency` sets how many jobs of each queue run at the same time. The default is 5.

`--queue` takes a comma-separated list of [queues](#named-queues). The worker runs one BullMQ worker for each queue in the list, in the same process. Without `--queue`, it runs every queue that a job uses. A queue that no job uses stops the worker at startup. Run `default` in at least one worker, because the schedules and queued listeners use it.

In production, start the built server with the same variable, next to the web processes. The worker needs only `.output`:

```sh
NUXVEL_ROLE=worker node .output/server/index.mjs
docker run -e NUXVEL_ROLE=worker ... registry.example.com/app:1.4.0
```

| Variable | Meaning |
|---|---|
| `NUXVEL_ROLE` | Set to `worker` to run the worker in this server. |
| `NUXVEL_WORKER_CONCURRENCY` | How many jobs of each queue the worker runs at the same time. The default is 5. `nuxvel queue:work` sets it from `--concurrency`. |
| `NUXVEL_WORKER_QUEUES` | The comma-separated queues that the worker runs, for example `mail,default`. When it is not set, the worker runs every queue. `nuxvel queue:work` sets it from `--queue`. |
| `NITRO_SHUTDOWN_TIMEOUT` | Milliseconds to wait at shutdown before the process stops. The default is 30000. |

The worker also answers HTTP on its port, so its container keeps the health check of the image. When a worker and a web process share a host, give the worker its own `PORT`.

### What the worker runs

The worker finds every job under `server/jobs/`. It also runs the queued listeners under `server/listeners/`, see [Domain events](./events.md), and the [schedules](#schedules). After you add a job file, restart the worker.

When a job, a queued listener or a schedule have the same name, the worker does not start.

### Shutdown

On `SIGTERM` or `SIGINT`, the worker:

1. Finishes the jobs that are running.
2. Sends the errors that it reported to error tracking.
3. Closes its connections and stops.

The built server uses the graceful shutdown of Nitro. Nitro also lets the running requests finish. It stops the process after `NITRO_SHUTDOWN_TIMEOUT` milliseconds. Give a worker that runs long jobs a longer timeout.

### Maintenance mode

`nuxvel down` pauses the queue, and `nuxvel up` resumes it. While the queue is paused, no worker starts a new job. Jobs that already run finish. Dispatches and the outbox relay continue to add jobs, and those jobs wait. Pass `--keep-queue` to `nuxvel down` to keep the queue running. See [Maintenance mode](./maintenance.md#queues).

### Logs

```
12:03:44 INFO  job  worker listening on queues "default", "mail", "webhooks": 4 jobs, 1 queued listener, 2 schedules, concurrency 5, outbox relayed on commit and every 1s
12:03:44 INFO  job  post.notify-followers #184 done  attempt=1 durationMs=12ms
12:03:45 WARN  job  nuxvel.mail #185 failed, retrying (attempt 2/3)  durationMs=3ms err="connect ECONNREFUSED 127.0.0.1:1025"
```

The worker logs through the [server logger](./observability.md#logging), with the tag `job`. It writes one line at startup, and one line for each attempt. Each attempt line has the fields `jobId`, `name`, `attempt` and `durationMs`.

| Level | When |
|---|---|
| `info` | The attempt finished. |
| `warn` | The attempt failed, and the job will retry. |
| `error` | The job failed for the last time. The stack is in `err`. |

A failed outbox relay writes an `error` line with the tag `outbox`.

In production, each line is JSON:

```
{"time":"…","level":"error","tag":"job","msg":"nuxvel.mail #185 failed (attempt 3/3)","jobId":"185","name":"nuxvel.mail","attempt":3,"durationMs":3.1,"err":{"name":"Error","message":"connect ECONNREFUSED 127.0.0.1:1025","stack":"…"}}
```

`nuxvel queue:work` prints pretty lines, as in the first sample. It prints JSON when `NODE_ENV=production`, or when `NUXT_LOG_FORMAT` sets a format.

When `NUXT_PUBLIC_SENTRY_DSN` is set, nuxvel reports a handler that throws to error tracking, tagged with the job name. See [Observability](./observability.md#error-tracking).

## Failures and retries

A handler that throws gets 3 attempts: the first run and two retries. The delay between attempts grows exponentially, from one second. After the third attempt, the job moves to the failed set of the queue. It stays there for 7 days. Then BullMQ removes it.

A completed job stays in the completed set for one hour, or until 1000 newer jobs complete on the same queue. Then BullMQ removes it. So Redis does not grow without limit, and old mail bodies, with their reset and verify links, do not stay in Redis.

### Job options

```ts
// server/jobs/post/sync-to-crm.job.ts
import { z } from "zod";

export const postSyncToCrmJob = defineJob({
  queue: "crm",
  attempts: 5,
  backoff: { type: "fixed", delay: 10_000 },
  timeout: 30_000,
  unique: ({ postId }) => String(postId),
  limiter: { max: 10, duration: 1000 },
  input: z.object({ postId: z.number() }),
  async handler({ postId }) {
    await syncToCrm(postId);
  },
});
```

These options of `defineJob` set how the job retries and runs. nuxvel gives them to BullMQ. All are optional:

| Option | Meaning |
|---|---|
| `attempts` | The number of attempts before the job moves to the failed set. The default is 3. |
| `backoff` | The time between attempts. Give milliseconds, or `{ type: "fixed" \| "exponential", delay }`. The default is exponential from one second. |
| `timeout` | Milliseconds that one attempt can run. An attempt that runs longer fails, and the job retries. nuxvel does not stop the handler. The default is no limit. |
| `unique` | A function that returns a key from the payload. While a job with the same key is on the queue and not finished, nuxvel does not add a new dispatch with that key. The outbox row stays and gets `dispatched_at`. |
| `limiter` | `{ max, duration }`: the worker runs not more than `max` jobs in `duration` milliseconds. Use it for a job that calls an external API with a rate limit. |

The limiter applies to all jobs of the queue. Put a job with a `limiter` on its own [queue](#named-queues). When two jobs of one queue set different limiters, the worker does not start.

Some payloads fail the same way on every attempt. For these, the job moves to the failed set after the first attempt:

- A payload that fails the `input` schema.
- A payload that no upcaster can bring to the current version.
- A payload with a version newer than the job's `version`.
- Queue data that is not a `{ version, payload }` envelope.
- A job name that nothing defines.

A handler that throws a taxonomy error follows the rules of its kind:

| Error | In a job |
|---|---|
| `ValidationFailedError`, `UnauthenticatedError`, `ForbiddenError`, `NotFoundError`, `ConflictError` | Fails without retry |
| `ActionError`, from an action's `fail()` | Fails without retry |
| `RateLimitedError`, such as an upstream `429` | Retries with the backoff |
| `TransientError`, such as a deadlock or an upstream `503` | Retries with the backoff |
| `UnknownError`, or any error outside the taxonomy | Retries with the backoff |

See [API errors](./api.md#errors) for the taxonomy.

Error tracking gets a failed attempt only for an error outside the taxonomy. It gets a `TransientError` only from the last attempt. It never gets the other taxonomy errors.

A handler can run more than one time for the same payload. Make it safe to repeat. For example, check for a row before you insert it, or key the write on a value in the payload.

```sh
nuxvel queue:failed
nuxvel queue:retry 185
nuxvel queue:retry all
```

`nuxvel queue:failed` lists the failed jobs of every queue, with their queue, ID, job name, attempts, failure time and reason. `--json` prints the list as JSON. `nuxvel queue:retry` puts one failed job back on its queue by its ID, or all failed jobs with `all`. Each queue numbers its jobs, so two queues can have a job with the same ID. Then add `--queue <name>`.

```sh
nuxvel queue:clear --failed
nuxvel queue:clear --waiting --queue reports
```

`nuxvel queue:clear` removes the waiting and failed jobs, after a confirmation. `--failed` or `--waiting` removes only that kind. `--waiting` also removes the delayed and prioritized jobs. `--queue` limits it to the listed queues. `--force` skips the confirmation. See [the CLI](./cli.md#nuxvel-queueclear).

## Payload versions

```json
{ "version": 1, "payload": { "postId": 7 } }
```

Each item on the queue is an envelope. `version` is the job's `version` at dispatch time. For a queued listener, it is the `version` of its event. A payload that waits in the queue during a deploy keeps its version, so the new code knows its shape.

When you change the `input` of a job, increase `version` and add the upcaster that converts the old payloads:

```ts
// server/jobs/post/notify-followers.job.ts
export const postNotifyFollowersJob = defineJob({
  version: 2,
  upcasters: {
    1: (payload) => ({ postId: (payload as { id: number }).id }),
  },
  input: z.object({ postId: z.number() }),
  async handler({ postId }) {
    await notifyFollowers(postId);
  },
});
```

| Option | Meaning |
|---|---|
| `version` | The version that `input` describes. The default is 1. |
| `upcasters` | Keyed by the version that a payload was written under. Each upcaster returns the payload in the shape of the next version. |

A version-1 payload for a version-3 job goes through upcaster `1`, then upcaster `2`. nuxvel validates the payload after the upcasters, always against the current `input`. A queued payload whose version has no upcaster fails the job immediately, without a retry.

```sh
nuxvel queue:versions
```

`nuxvel queue:versions` lists the pending jobs on the queue for each name and version, with the number of delayed and prioritized jobs. It flags each group that the current code cannot run:

- A name that nothing in the code defines.
- Data that is not a `{ version, payload }` envelope.
- A version newer than the defined version.
- A version with no upcaster.

Queued listeners show as `listener:<name>`, with the version of their event. `--json` prints the list as JSON. See [the CLI](./cli.md#nuxvel-queueversions).

## Renaming a job

```ts
// server/jobs/notify-followers.job.ts
import { postNotifyFollowersJob } from "./post/notify-followers.job";

export default renamed(postNotifyFollowersJob);
```

When you move a job file, the job gets a new name. Jobs that are already queued under the old name then match no job. Keep the old file as a `renamed()` alias. Remove it when `nuxvel queue:versions` shows no jobs under the old name. See [Renaming a definition](./index.md#renaming-a-definition).

## Schedules

```ts
// server/schedules/posts/prune-drafts.schedule.ts
export const postsPruneDraftsSchedule = defineSchedule({
  at: { hour: 3 },
  async handler() {
    await pruneOldDrafts();
  },
});
```

A schedule runs work on a clock, not after a dispatch. Put each schedule in its own file under `server/schedules/`, as a named export. `defineSchedule` is auto-imported. nuxvel finds the file. You do not register it.

`nuxvel make:schedule posts.prune-drafts` writes this file, with `at: { hour: 3 }` and a handler that logs the schedule name. Add `--domain <domain>` to write it into a [domain folder](./auto-imports.md#domain-folders).

The file path gives the schedule name, here `posts.prune-drafts`. `nuxvel schedule:list` prints this name, and the schedule's entry in Redis uses it as its key. A schedule has no payload.

The handler runs as `systemActor(name)`, with the schedule name. So `audit()` works in the handler, and an action runs without an `actor` option. A job that the handler dispatches runs as the same actor. The handler gets no transaction. Wrap the writes in `transaction()` when they must commit together.

### Timing

Give a schedule `every` or `at`, never both. `defineSchedule` throws when you give both or neither.

`every` takes one unit. The step must divide the next unit evenly, so each tick is at the same place on the clock:

```ts
every: { seconds: 30 }   // seconds and minutes: 1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30
every: { minutes: 5 }
every: { hours: 6 }      // 1, 2, 3, 4, 6, 8, 12
every: { days: 1 }       // midnight
```

`at` takes clock times:

| Field | Values |
|---|---|
| `minute` | `0` to `59` |
| `hour` | `0` to `23` |
| `day` | `1` to `31` |
| `weekday` | `"sunday"` to `"saturday"` |
| `month` | `"january"` to `"december"` |

Each field takes one value, or an array that means "any of these". A field that you leave out and that is finer than the coarsest field you give starts at its first value. A field coarser than it means "any":

```ts
at: { hour: 3 }                                // 03:00 every day
at: { minute: [0, 30] }                        // every hour at :00 and :30
at: { hour: [9, 17], weekday: ["monday", "friday"] }
at: { weekday: "monday" }                      // Monday at 00:00
at: { day: 1, hour: 6 }                        // the 1st of each month at 06:00
at: { month: "january" }                       // January 1st at 00:00
```

`minute` is a time on the clock, not a step. To run every n minutes, use `every: { minutes: n }`.

You cannot use `day` and `weekday` together, because cron runs on either one, not on both. A value out of range, a step that does not divide evenly, or `every` and `at` together fail to compile.

### Time zones

Times use the time zone of the worker: `TZ`, or else the system time zone. At a daylight-saving change, schedules follow the wall clock:

- A time whose `hour` is in the hour that spring skips runs one hour late on that day. 02:30 runs at 03:30.
- A time in the hour that autumn repeats runs one time.
- A schedule that ticks every hour or more often has no tick in the skipped hour, and ticks two times in the repeated hour.

To prevent both, run the worker with `TZ=UTC`.

### Registering schedules

The worker registers each schedule in Redis when it starts, with its current timing. After you add or change a schedule, restart the worker.

The worker never removes an entry that it does not know. During a rolling deploy, that entry can belong to a worker that runs newer code. When every worker runs the new code, run `nuxvel schedule:prune`. It removes the entries that a moved or removed schedule left in Redis.

To move a schedule file without a new entry, keep a `renamed()` alias at the old path. The schedule then keeps its entry under the old name.

Each tick is a job. It retries on failure and it can run two times, so make the handler safe to repeat.

```sh
nuxvel schedule:list
nuxvel schedule:prune
```

`nuxvel schedule:list` shows each schedule, when it runs, and its next run. It flags an entry in Redis that no `defineSchedule` matches. `--json` prints the list as JSON. `nuxvel schedule:prune` removes the entries that no `defineSchedule` matches. `--dry-run` lists them and removes none.

```sh
nuxvel schedule:run posts.prune-drafts
```

`nuxvel schedule:run` runs one tick of a schedule now, in the app, without the worker. Use it to see what a schedule does before its time comes.

## Tasks

```ts
// server/tasks/reindex-posts.ts
export default defineTask({
  meta: {
    name: "reindex-posts",
    description: "Rebuild the post search index.",
  },
  run: async ({ payload }) => {
    await reindexPosts(payload);

    return { result: "ok" };
  },
});
```

A task is one-off work that you run by hand, for example a backfill, a re-index, or a cleanup after an incident. A task is a Nitro task. Put each task in its own file under `server/tasks/`.

```sh
nuxvel make:task reindex-posts
nuxvel task:run reindex-posts --payload '{"since":"2026-01-01"}'
```

`nuxvel make:task` writes the task file. `nuxvel task:run` builds and starts the app's Nitro server, and runs the task in it with Nitro's `runTask`. `--payload` must be a JSON object.

A task is not queued and not retried. It runs one time, where you start it. See [the CLI](./cli.md#nuxvel-maketask--nuxvel-taskrun).

## The dashboard

```
https://<app>.localhost/_nuxvel/queue
```

In development, the dev server shows [Bull Board](https://github.com/felixmosh/bull-board) at `/_nuxvel/queue`. It shows each queue on its own, with the waiting, active, delayed, completed and failed jobs and the payload of each job.

A production build does not have this route. Like the [DevTools tab](./devtools.md), the dashboard answers only requests from this machine. Other requests get `403`. You do not sign in to the app to use it.

## Testing

```ts
// server/jobs/post/notify-followers.job.test.ts
import { expectQueued, runAction, runJob } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("post.notify-followers job", () => {
  it("is queued when a post is published", async () => {
    const author = await userFactory();
    const post = await postFactory({ author });

    await runAction("posts.publish-post", { id: post.id }, { actingAs: author });

    await expectQueued("post.notify-followers", { postId: post.id }, { times: 1 });
  });

  it("runs its handler", async () => {
    const post = await postFactory();

    await runJob("post.notify-followers", { postId: post.id });
  });
});
```

A functional test never reaches the real Redis queue. The relay records each job in a queue fake.

| Fixture | Checks or does |
|---|---|
| `expectQueued(name, match?, { times? })` | The job reached the queue. With `times`, it reached the queue that number of times. A job with `unique` that is already queued counts once. It relays the outbox first. |
| `expectNotQueued(name, match?)` | The job did not reach the queue with payload fields that match. It relays the outbox first. |
| `runJob(name, input, { actingAs? })` | Runs the handler in the app now, without the queue. With `actingAs`, the user is the dispatcher. |
| `workQueue()` | Runs every job and queued listener in the queue fake, until it is empty. It skips `nuxvel.mail`. |
| `runSchedule(name)` | Runs one tick of a schedule in the app now, without the worker and the clock. |
| `useRealQueue()` | Uses the real BullMQ queue for the whole test file. |

Each fixture takes a job name or a job definition from `$jobs`.

The queue fake applies `unique` as the real queue does. While a job with the key `<job name>:<key>` is in the fake, a second dispatch with the same key is dropped, and `expectQueued` sees one job. `workQueue()` and `runJob` free the key when they take the job, so the next dispatch is queued again.

`runJob` validates `input` like a real dispatch. When the handler throws, `runJob` rejects with that error. The effect of the handler is in the database when `runJob` resolves. A job that the handler dispatches goes to the queue fake, so `expectQueued` sees it.

```ts
it("fails at once for a missing post", async () => {
  await expect(runJob("post.notify-followers", { postId: 0 })).rejects.toBeUnrecoverable();
});
```

`toBeUnrecoverable()` passes when the worker fails the error at once. `toBeRetryable()` passes when the worker retries it. Both take the rejection of `runJob`. See [Failures and retries](#failures-and-retries).

The fixtures take a `JobName`, and the `match` fields are typed by the job's `JobInput`. A misspelled job name fails to compile. See [Testing](./testing.md).

## See also

- [Domain events](./events.md)
- [Realtime](./realtime.md)
- [Redis](./redis.md)
- [Observability](./observability.md)
- [Maintenance mode](./maintenance.md)
- [CLI](./cli.md)
- [Testing](./testing.md)
