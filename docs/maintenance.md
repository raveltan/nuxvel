# Maintenance mode

## Introduction

Maintenance mode takes the app offline for its users while you do work that must not run beside live traffic, such as a long migration of the posts table. `nuxvel down` puts the app in maintenance mode, and `nuxvel up` brings it back. While the app is down, every request gets a `503` response with a maintenance page or a JSON error.

## Going down and up

```sh
nuxvel down --message "Upgrading the blog. Back in a few minutes." --retry 120
# ✔ The app is down for maintenance, the queue is paused

nuxvel db:migrate

nuxvel up
# ✔ The app is up, the queue runs again
```

`nuxvel down` writes the state to Redis, under the key `nuxvel:maintenance` after the [app's key prefix](./redis.md#key-prefix). Every web server and every worker that shares that Redis reads the same key, so all of them go down at the same time. There is no file to copy between servers. Run `nuxvel down` from any machine that can reach the Redis of the app.

| Flag | Description |
| --- | --- |
| `--message` | The text of the maintenance page and of the 503 responses. The default is `The app is down for maintenance. Please check back soon.` |
| `--retry` | The seconds in the `Retry-After` header. The default is `60`. |
| `--secret` | A token of at least 8 letters, digits, `-` or `_`. A browser that opens `/<secret>` gets access. |
| `--allow` | An IP address that keeps full access. Repeat the flag for more addresses. |
| `--keep-queue` | Do not pause the queue. |
| `--force` | On a VPS, run it without the question. See [On a VPS](#on-a-vps). |

Run `nuxvel down` again to change the message or another setting. The new settings replace the old ones.

`nuxvel maintenance:status` shows the current state:

```sh
nuxvel maintenance:status
# STATE  SINCE                     RETRY  BYPASS  ALLOW  QUEUE   MESSAGE
# down   2026-09-25T07:00:00.000Z  120s   none    none   paused  Upgrading the blog. Back in a few minutes.
```

## On a VPS

Give the environment of `nuxvel.deploy.ts` to put the app on its server in maintenance mode:

```sh
nuxvel down production --message "Upgrading the blog. Back in a few minutes." --secret deploy-2026-10
# ◆ Put blog in production (203.0.113.10) in maintenance mode? Its users get a 503 until nuxvel up production
# ✔ The app is down for maintenance, the queue is paused
#   → Bypass it at /deploy-2026-10

nuxvel maintenance:status production

nuxvel up production
# ◆ Take blog in production (203.0.113.10) out of maintenance mode?
# ✔ The app is up, the queue runs again
```

On the server, Redis listens only on localhost. So each command connects over SSH as the deploy user, and runs in the live release with `shared/.env`, as [`nuxvel tinker <env>`](./deploy.md#logs-status-and-a-shell) does. Both colors of the app use the same Redis and the same key prefix, so the web processes and the workers of blue and green all go down. A color that a later deploy starts reads the same key, so it starts in maintenance mode too.

`down <env>` and `up <env>` ask first. `--force` skips the question. Without a terminal, they refuse unless you pass `--force`. `maintenance:status <env>` changes nothing, so it does not ask.

`nuxvel doctor` shows maintenance mode as a warning, so a forgotten `nuxvel down` does not stay hidden. See [the CLI](./cli.md#maintenance) for `--json` and the exit codes.

## What stays up

While the app is down, a request gets a `503` response with a `Retry-After` header and `Cache-Control: no-store`. These requests stay up:

- `GET /api/health/live` and `GET /api/health/ready`. They answer as usual and add `"maintenance": true` to the body, so the load balancer keeps the servers. See [Health endpoints](./observability.md#health-endpoints).
- The realtime endpoints under `/api/channels`, so open tabs stay connected.
- The assets of the app under `/_nuxt/`, so the maintenance page has its styles.
- The nuxvel paths under `/_nuxvel/`: the DevTools tab and the queue board in development, and the control routes of the test fixtures.
- Requests from an allowed IP address, and from a browser with the bypass cookie. See [Bypass](#bypass).

```json
{ "status": "ready", "database": "reachable", "redis": "reachable", "maintenance": true }
```

The check runs before the other middleware of nuxvel and of the modules. Middleware of the app under `server/middleware/` runs first.

A route with the `cached` rendering preset never serves or stores the `503`. The maintenance check answers before the cache, and the next request after `nuxvel up` gets the cached page again. See [Rendering](./rendering.md).

When Redis is unreachable, the app acts as if it is up.

## Bypass

```sh
nuxvel down --secret deploy-2026-09 --allow 203.0.113.7
# ✔ The app is down for maintenance, the queue is paused
#   → Bypass it at /deploy-2026-09
```

Open `https://blog.example.com/deploy-2026-09` in your browser to use the app while it is down. The app sets the `nuxvel_maintenance` cookie and sends you to `/`. The cookie is valid for 12 hours, or until `nuxvel down` sets a different secret. It is `HttpOnly`, `SameSite=Lax`, and `Secure` over HTTPS.

`--allow` gives full access to one IP address, for example the office or a monitoring service. Repeat it for more addresses. The app compares the client IP. By default, this is the address of the connection, not the `X-Forwarded-For` header. Behind a proxy, set `nuxvel.security.trustProxy`. See [Security: client IP behind a proxy](./security.md#client-ip-behind-a-proxy).

## Queues

`nuxvel down` pauses the queue of the app. `nuxvel up` resumes it. While the queue is paused:

- No worker starts a new job, queued listener or schedule run. A job that already runs finishes.
- `$jobs.x.dispatch()`, `$mails.x.send()` and the outbox relay continue to add jobs. The jobs wait in the queue and run after `nuxvel up`.
- Schedules stay registered. A schedule run that comes due waits in the queue. Each schedule keeps at most one waiting run, so after `nuxvel up` it runs one time, not one time for each missed tick.

Pass `--keep-queue` when the jobs must continue, for example when the work does not touch the tables that the jobs use:

```sh
nuxvel down --keep-queue
```

## In the app

### The maintenance page

The app shows the `<Maintenance>` component for a page request. It renders the message of `nuxvel down` in a Nuxt UI `UError`, or in plain markup when the app sets `nuxvel.ui: false`. The server renders the page, with the styles of the app.

nuxvel renders `<Maintenance>` when the app has no `app/error.vue`. When the app has its own `error.vue`, render it there with `isMaintenanceError()`:

```vue
<!-- app/error.vue -->
<script setup lang="ts">
import type { NuxtError } from "#app";

defineProps<{ error: NuxtError }>();
</script>

<template>
  <Maintenance v-if="isMaintenanceError(error)" :error="error" />
  <UError v-else :error="error" />
</template>
```

`isMaintenanceError()` and `<Maintenance>` are auto-imported. To show a page of your own, render it in place of `<Maintenance>`. `error.message` is the message of `nuxvel down`.

### The banner

```vue
<!-- app/app.vue -->
<template>
  <UApp>
    <MaintenanceBanner />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
```

`<MaintenanceBanner>` tells the open tabs when the app goes down and when it is back. `nuxvel down` and `nuxvel up` broadcast on the built-in `maintenance` channel, so the banner changes with no reload. While the app is down, the banner shows the message of `nuxvel down`. When it is back, the banner says `The app is back.` and has a `Reload` button. The banner is a Nuxt UI `UBanner`, so it is not registered with `nuxvel.ui: false`.

In an open tab, each request to the app also gets the `503`, unless the browser has the bypass cookie or an allowed IP address.

For a banner of your own, use `useMaintenance()`:

```vue
<script setup lang="ts">
const maintenance = useMaintenance();
</script>

<template>
  <p v-if="maintenance.down" role="status">{{ maintenance.message }}</p>
</template>
```

`useMaintenance()` is auto-imported. It returns a read-only ref of `{ down, message, retryAfter }`, which updates live. A page that the server renders through the bypass or an allowed IP starts with `down: true`. `message` and `retryAfter` are `null` while the app is up.

### API and tRPC responses

A request to an API route gets the error as JSON:

```json
{
  "statusCode": 503,
  "message": "Upgrading the blog. Back in a few minutes.",
  "data": { "code": "MAINTENANCE", "message": "Upgrading the blog. Back in a few minutes.", "retryAfter": 120 }
}
```

A tRPC call fails with the message of `nuxvel down`, the code `SERVICE_UNAVAILABLE`, and `data.maintenance` and `data.retryAfter`. So a form that uses `useActionForm()` shows the message in `formError`, like any other error. See [Frontend](./frontend.md#form-errors).

## Testing

```ts
import { it } from "vitest";
import { expect, guest, startMaintenance, stopMaintenance } from "@nuxvel/nuxt/testing";

it("answers 503 with a retry time while the app is down", async () => {
  await startMaintenance({ message: "Back at 10:00", retryAfter: 120 });

  const response = await guest().fetch("/posts");

  expect(response.status).toBe(503);
  expect(response.headers.get("retry-after")).toBe("120");
});
```

`startMaintenance()` puts the app under test in maintenance mode, as `nuxvel down` does. It takes `message`, `retryAfter`, `secret`, `allow` and `keepQueue`. `stopMaintenance()` brings the app back, as `nuxvel up` does. The state lives in Redis. `@nuxvel/nuxt/testing/database` flushes the Redis database of the worker after each test, so the app is up again for the next test. Call `stopMaintenance()` to end maintenance inside a test. A functional test does not read the page that the app shows. Check that page in a story or with [`visit()`](./testing.md#visit).

## See also

- [CLI](./cli.md#maintenance)
- [Queues](./queues.md)
- [Redis](./redis.md)
- [Observability](./observability.md#health-endpoints)
- [Testing](./testing.md)
- [Frontend: maintenance banner](./frontend.md#maintenance-banner)
