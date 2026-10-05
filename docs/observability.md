# Observability

## Introduction

nuxvel writes structured logs, logs every request and action call, and serves two health endpoints. It can also send unexpected errors to a Sentry-compatible error tracker. Use these features to see what the app does in production and to find the cause of a failure.

## Configuration

```
NUXT_LOG_LEVEL=info
NUXT_LOG_FORMAT=json
NUXT_PUBLIC_SENTRY_DSN=http://<key>@localhost:8000/1
```

| Variable | Values | Default |
|---|---|---|
| `NUXT_LOG_LEVEL` | `silent`, `fatal`, `error`, `warn`, `info`, `debug`, `trace` | `info` |
| `NUXT_LOG_FORMAT` | `pretty`, `json` | `pretty` in `nuxt dev`, `json` in all other cases |
| `NUXT_PUBLIC_SENTRY_DSN` | The DSN of a Sentry-compatible project | Empty. No errors are reported. |

A log value that is not in the list stops the server at boot, the same as any other [invalid variable](./security.md#env-validation-at-boot). A DSN that is not a URL also stops the server and `nuxvel queue:work` at boot, with `NUXT_PUBLIC_SENTRY_DSN is not a valid DSN URL`.

## Logging

```ts
const log = useLogger("posts");

log.info("post published", { postId: post.id, title: post.title });
log.error("publish failed", error, { postId: post.id });
```

`useLogger(tag?)` returns the server logger. It is auto-imported in `server/`. The tag names the part of the app that writes the line.

The logger is a [consola](https://github.com/unjs/consola) instance. Its levels are `fatal`, `error`, `warn`, `info`, `debug` and `trace`. The other consola methods (`log`, `success`, `fail`, `ready`, `start`, `box`) log at `info`.

Pass the arguments in any order:

- A string is the message.
- A plain object adds its keys as fields.
- An `Error` goes in the `err` field, with its name, message, stack and cause. A failed database query keeps its SQL in the message and the Postgres error in the cause, but not its bound parameters. Sentry reports and failed jobs get the same text.

### JSON lines

```
{"time":"2026-09-24T12:03:44.120Z","level":"info","tag":"posts","msg":"post published","postId":12,"title":"Hello","requestId":"7f3c…","actor":"user:u_123"}
{"time":"2026-09-24T12:03:44.503Z","level":"error","tag":"posts","msg":"publish failed","postId":12,"err":{"name":"Error","message":"connection terminated","stack":"…"},"requestId":"7f3c…","actor":"user:u_123"}
```

In production, and in every other process that `nuxt dev` does not start, each line is one JSON object. `info`, `debug` and `trace` lines go to stdout. `warn`, `error` and `fatal` lines go to stderr.

Better Auth's warnings and errors are lines with the tag `auth`.

In JSON mode, the server also sends `console.*` calls through the logger. A `console.log` in your code or in a library becomes a JSON line with the tag `console`. It does not break the parser of a log collector.

On the dev server, the server sends `console.*` calls through the logger in all formats. A `console.warn` from your code, from Vue or from Nuxt becomes a pretty line with the tag `console` and `req=`. The terminal shows the line one time, and the [DevTools tab](./devtools.md#console-calls) shows it too.

Node prints a process warning, such as an `ExperimentalWarning` or a `DeprecationWarning`, with `console.error`. The logger writes this line at the `warn` level, not at `error`. The line starts with `(node:<pid>)`.

An error in a Nitro cached handler or cached function (`defineCachedEventHandler`, `defineCachedFunction`) also gives one line. Nitro writes a `[cache]` line with `console.error` and then sends the error to its error hook. The logger drops the `[cache]` line. The error hook writes the line: `GET /path failed` with the tag `request` and the request ID when the cache has the request event, else `a cached function failed` with the tag `cache`. The error also goes one time to Sentry and to the DevTools tab.

### Pretty lines

```
12:03:44 INFO  posts  post published  postId=12 title=Hello req=7f3c9a2e actor=user:u_123
```

In `nuxt dev`, each line is pretty text. The request ID shows as its first 8 characters. Only `error` and `fatal` lines show the stack.

An `error` or `fatal` line also shows the cause chain of the error. Each cause starts on a new line with `Caused by:`, and then shows its name, its message and its stack. The line shows a maximum of 5 causes, the same as the `err` field of a JSON line. A failed database query thus shows the SQL first, and then the Postgres error that gives the reason:

```
12:03:44 ERROR request  GET /api/posts failed  req=7f3c9a2e
DrizzleQueryError: Failed query: select "id", "title" from "posts"
    at …
Caused by: PostgresError: relation "posts" does not exist
    at …
```

A record with a `hint` field, such as the [migration hint](./database.md#migrations), shows the hint on its own line in yellow, right after the line and before the stack. The line does not show `hint=` as a field. A JSON line keeps `hint` as a field.

```
12:03:44 ERROR request  GET /api/posts failed  req=7f3c9a2e
  → The database tables do not match the schema of the app. …
DrizzleQueryError: Failed query: select "id", "title" from "posts"
```

A `warn` line stays on one line. It shows the message of the error in `err=` and the message of the last cause in `cause=`. When the last cause has an empty message, `cause=` shows its `code`, or else the message of its first inner error. An `AggregateError` of a refused connection thus shows `cause="ECONNREFUSED"`. The `err` field of a JSON line then also has a `detail` field with the same text.

### Request ID and actor

Each line that is logged during a request has these fields:

- `requestId`. This is the ID that [`currentRequestId()`](#request-ids) returns.
- `actor`, when the actor is known. It is `"user:<id>"` after `auth()`, `requireAuth()` or an `authedProcedure` resolves the session. In an action, it is the actor of the action, such as `"system:<name>"` for a `systemActor()`.

The logger never looks up a session itself. It never writes an email address or a role.

Outside a request, such as in a job or a command, a line has no `requestId`. It has an `actor` only inside an action. A field with no value is not in the line. It is never `null`.

### Logs from commands and the worker

Commands such as `nuxvel tinker` and `nuxvel task:run` keep their plain console output. While a command runs, all app log lines go to stderr, so stdout holds only the data of the command. These lines are pretty unless you set `NUXT_LOG_FORMAT`.

`nuxvel queue:work` writes pretty lines unless you set `NUXT_LOG_FORMAT` or `NODE_ENV=production`.

## Request logging

```
{"time":"…","level":"info","tag":"request","msg":"GET /api/posts 200 (12ms)","method":"GET","path":"/api/posts","status":200,"durationMs":12.4,"requestId":"5f1c…","actor":"user:u_123"}
```

The server logs each request one time, after it sends the response. The `request` line has the method, the path, the status, the duration, the request ID and, when the session was resolved, the actor. In `nuxt dev` the line is `12:03:44 INFO  request  GET /api/posts 200 (12ms)  req=5f1c…`.

A request that ends in an error also gets a `request` line with the status of the error. This includes a thrown 4xx (for example a `NotFoundError` from a route), a missing page, a tRPC error and a 5xx. A 5xx from a route also gets an error line, see [Error tracking](#error-tracking). When Nuxt renders a page as an error, a second `GET /__nuxt_error` line has the same request ID.

The logged path never has its query string. The token in `/api/auth/reset-password/<token>` shows as `[redacted]`. A secret in the URL thus never gets into the logs.

Nitro's own `[request error]` line is off. The server logs a failed handler one time, as a `request` error line.

### Action lines

```
{"time":"…","level":"info","tag":"action","msg":"posts.publish-post ok (11ms)","action":"posts.publish-post","actor":"user:u_123","durationMs":11.4,"ok":true,"requestId":"5f1c…"}
```

Each [`defineAction()`](./actions.md) call writes an `action` line. The line has the name of the action, `ok`, `durationMs` and the actor as `"type:id"`. When the action fails, `ok` is `false`, the line has an `error` field, and the message is `<name> failed: <error> (<n>ms)`.

### Request IDs

```sh
curl -H 'x-request-id: abc-123' http://localhost:3000/api/trpc/post.list
```

The request ID comes from the `x-request-id` header of the request. The server makes a new ID when the header is missing or not valid. A valid ID has 1 to 128 characters: letters, digits and `_ . : / + = -`.

`currentRequestId()` returns the ID anywhere in the request: a `server/api` handler, a tRPC procedure, an action or a `useCaller()` call. Outside a request, such as in a job, a schedule or a CLI command, it returns `undefined`. It is auto-imported on the server.

The request line, its action lines, its audit rows and its reported errors all have the same ID. Use it to follow one request from end to end.

The server sends the ID as `x-request-id` when it calls itself through `event.fetch` or `event.$fetch` of the request. SSR tRPC calls, `useFetch` and `useRequestFetch()` use these. Their request lines and logs thus have the ID of the page. A bare `$fetch` on the server gets a new ID.

## Health endpoints

```json
{ "status": "live" }
```

`GET /api/health/live` always returns `200`. It does not touch the database or Redis, so it answers while the app is degraded. Use it for the liveness probe of your orchestrator. A failure means that the process is gone, not that a dependency is down.

```json
{ "status": "ready", "database": "reachable", "redis": "reachable", "disk": "ok" }
```

```json
{ "status": "unavailable", "database": "reachable", "redis": "unreachable", "disk": "ok" }
```

`GET /api/health/ready` returns `200` when `useDb()` can reach the database and Redis answers a `PING` within 2 seconds. The `PING` goes to the `cache` connection, so with `NUXT_REDIS_CACHE_URL` set, it checks the cache Redis. It returns `503` when either check fails. Use it for your readiness probe and your load balancer. Traffic then stops while a dependency is not reachable.

```json
{ "status": "degraded", "database": "reachable", "redis": "reachable", "disk": "low" }
```

The endpoint also measures the free space on the disk of the working directory of the server. Under 15 percent free, `disk` is `"low"` and `status` is `"degraded"`. The response is still `200`, so traffic continues. A check that looks only at the status code does not see `"degraded"`. Let your monitoring read `status` in the body and alert on `"degraded"`.

On a server that `nuxvel server:setup` prepared, the nuxvel monitor does not read the body. Each minute it requests `/api/health/ready` of the live color with `curl -f` and a timeout of 5 seconds. Any `2xx` answer counts as ready, so a `"degraded"` answer counts as ready too. The monitor fires the Health alert when the request fails for 2 minutes: a `503`, another error status, or no answer. The monitor checks the disk itself. It measures `/srv`, sends a warning at 80 percent full and a critical alert at 90 percent full. See [Monitoring](./deploy.md#monitoring).

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: {
    health: { minFreeDiskPercent: 10 },
  },
});
```

`nuxvel.health.minFreeDiskPercent` changes the threshold. `NUXT_NUXVEL_HEALTH_MIN_FREE_DISK_PERCENT` overrides it at runtime.

In [maintenance mode](./maintenance.md), both endpoints stay up and answer as usual. The body also has `"maintenance": true`, so the load balancer keeps sending traffic to the servers:

```json
{ "status": "ready", "database": "reachable", "redis": "reachable", "disk": "ok", "maintenance": true }
```

The module adds both endpoints. You do not register them. `nuxvel doctor --url <app-url>` checks that both answer. See [CLI](./cli.md#nuxvel-doctor).

## Error tracking

```
NUXT_PUBLIC_SENTRY_DSN=http://<key>@localhost:8000/1
```

Set `NUXT_PUBLIC_SENTRY_DSN` to send unexpected errors to a Sentry-compatible tracker. Use [Bugsink](https://www.bugsink.com) in development. Use Bugsink, Sentry or GlitchTip in production. When the DSN is empty, nuxvel reports nothing.

### Reported errors

nuxvel reports these errors. You write no code for them:

| Error | Tags |
|---|---|
| An error that a tRPC request or a `useCaller()` call throws, in a procedure or while it builds its context. Expected errors are not reported, see below. | `requestId`, `procedure` |
| A Nitro handler or a server-rendered page that fails with an unexpected error. | `requestId` |
| An `onCommit` hook that fails after the commit. | `requestId` |
| An error that Nitro reports outside a request: an unhandled rejection, an uncaught exception or a server plugin that throws. Nitro already logs it. | |
| An error that Better Auth logs with an error object, for example an auth mail that fails after the response. | `requestId` |
| A job, queued listener or schedule that throws under `nuxvel queue:work`. An error outside the taxonomy is reported one time for each failed attempt. A `TransientError` is reported only from the last attempt. | `job` |
| A job that cannot broadcast its progress on its channel. | `job` |
| An error in the browser: a component, an event handler, an uncaught exception or an unhandled rejection. | |

The error taxonomy holds the expected errors, see [API errors](./api.md#errors). nuxvel does not report them. Examples are `ValidationFailedError`, the `fail()` of an action, `ForbiddenError`, `UnauthenticatedError` and `NotFoundError`. A taxonomy error that a Nitro handler throws answers with its own `4xx`. nuxvel does not report it and does not log it at `error`. `UnknownError` is the exception: nuxvel reports it and logs it at `error`.

The `requestId` tag is the ID in the request line. An event in the tracker thus leads to its log lines, action lines and audit rows. Send `x-request-id` to choose the ID yourself.

A server event holds the request method and the path only. nuxvel removes the headers, the cookies, the query string and the request body before it sends the event. nuxvel replaces the token in a reset-password path with `[redacted]`. To change events, call `Sentry.addEventProcessor()`. Do not call `Sentry.init()` in your app, because nuxvel then does not remove the request data.

A browser event and its breadcrumbs hold the URL path only. nuxvel removes the query string and the fragment of the page URL, of the previous page URL and of each request URL. For example, the token of `/reset-password?token=...` does not go to the tracker.

`nuxvel queue:work` sends the events that are not sent yet before it stops on `SIGTERM` or `SIGINT`. It waits up to 2 seconds.

### Error lines

```
{"time":"…","level":"error","tag":"trpc","msg":"post.create failed","procedure":"post.create","err":{"name":"Error","message":"boom","stack":"…"},"requestId":"…","actor":"user:u_123"}
```

With or without a DSN, nuxvel also [logs](#logging) each server error at `error`, with its stack in `err`:

| Error | Tag | Extra fields |
|---|---|---|
| A procedure | `trpc` | `procedure` |
| A Nitro handler | `request` | |
| A failed `onCommit` hook | `db` | |
| The last failed attempt of a job under the worker | `job` | `jobId`, `name`, `attempt`, `durationMs` |
| A failed outbox relay | `outbox` | |

A job attempt that fails and will retry logs at `warn`. See [Queues](./queues.md#logs). A `TransientError` from a procedure or a Nitro handler logs at `warn`, with its `cause` in `err`.

```
12:03:44 WARN  request  GET /api/posts failed with BAD_REQUEST: Invalid input  fields={"title":["Required"]} req=5f1c…
```

In development, a taxonomy `4xx` from a Nitro handler also logs at `warn`. Examples are a validation error, `ForbiddenError`, `UnauthenticatedError`, `NotFoundError`, `ConflictError` and `RateLimitedError`. The line has the `code` and the message of the error. A validation error also has its `fields`. In production, nuxvel does not log these errors.

In development, a procedure that fails with a 4xx also logs at `warn`, with the tag `trpc`. The codes are `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS` and `UNPROCESSABLE_CONTENT`. The line has the message, `procedure`, `code` and, for an input that fails its schema, the errors per field in `fields`. A call to a procedure that does not exist does not log. In production, these errors do not log.

The client gets only a generic message and the request id for these errors, in development too. Search the logs for that id to find the real error. In development, the [DevTools](./devtools.md#find-an-error-by-its-request-id) entry of that id also shows it. See [What the client sees](./api.md#what-the-client-sees).

### Content Security Policy

nuxvel adds the origin of the DSN to the `connect-src` of the Content Security Policy of the page. The browser can then send its events.

The DSN that the server runs with is the one that counts. When you set `NUXT_PUBLIC_SENTRY_DSN` only at runtime, you do not need a new build. A runtime value replaces a value from the build.

A policy without `connect-src` gets one, made from its `default-src` and the DSN origin. A policy with neither directive does not restrict connections.

### Bugsink in development

```sh
docker run -d --name bugsink -p 8000:8000 \
  -e SECRET_KEY=local-bugsink-secret-key-not-for-production \
  -e CREATE_SUPERUSER=admin@example.test:admin \
  -e BASE_URL=http://localhost:8000 -e PORT=8000 \
  bugsink/bugsink:2
```

The `docker-compose.yml` of a new app does not include Bugsink. Error tracking stays off until you set a DSN. To try it locally, start Bugsink with the command above.

1. Open <http://localhost:8000>.
2. Sign in as `admin@example.test` with the password `admin`.
3. Create a team and a project.
4. Copy the DSN of the project into `.env` as `NUXT_PUBLIC_SENTRY_DSN`.
5. Restart the dev server.

The `docker-compose.yml` of the nuxvel repository runs this service for the playground. Its user is `admin@nuxvel.test` with the password `admin`.

## Testing

```ts
import { describe, it } from "vitest";
import { expect, guest } from "@nuxvel/nuxt/testing";

describe("the app", () => {
  it("reaches its database and Redis", async () => {
    const body = await guest().$fetch("/api/health/ready");

    expect(body).toMatchObject({ database: "reachable", redis: "reachable" });
  });
});
```

A new app has this test in `tests/functional/health.test.ts`. See [Testing](./testing.md).

```ts
import { expect, expectErrorReported, expectLogged, expectNoErrorReported, guest } from "@nuxvel/nuxt/testing";

it("reports an unexpected error and logs a retry", async () => {
  await expectNoErrorReported();

  await expect(guest().trpc.health.explode()).rejects.toThrow();

  await expectErrorReported("procedure exploded");
  await expectLogged("warn", "charge retried");
});
```

`expectErrorReported(match?, { times? })` checks that the app handed an error to error tracking. `match` is text that the message contains, or a pattern. `expectNoErrorReported()` checks that it handed none. `expectLogged(level, match, { times? })` checks that the app logged a line at that level. It sees only the lines at or above `NUXT_LOG_LEVEL`, which is `info` by default.

## See also

- [Deploying: Monitoring](./deploy.md#monitoring)
- [Deploying: Alerts](./deploy.md#alerts)
- [Deploying: Metrics](./deploy.md#metrics)
- [Deploying: Log shipping](./deploy.md#log-shipping)
- [Deploying: Logs, status and a shell](./deploy.md#logs-status-and-a-shell)
- [Queues](./queues.md#logs)
- [Security](./security.md)
- [API](./api.md#errors)
- [Redis](./redis.md)
- [DevTools](./devtools.md)
