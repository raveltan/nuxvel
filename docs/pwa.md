# Progressive web app

## Introduction

A progressive web app (PWA) is a web app that a user can install on the home screen and use without a network. Set `nuxvel.pwa` to make your app a PWA. nuxvel then installs [`@vite-pwa/nuxt`](https://vite-pwa-org.netlify.app/frameworks/nuxt) and configures its web app manifest, its service worker and an offline page. A PWA can also receive push notifications, such as "New comment on your post", while the app is closed.

## Installing the app

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    pwa: {
      name: "Acme Blog",
      shortName: "Blog",
      themeColor: "#0f172a",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
  },
});
```

The PWA is off until you set `nuxvel.pwa`. With the option, the production build serves a web app manifest at `/manifest.webmanifest` and a service worker at `/sw.js`. Each page links the manifest.

| Option | Value |
|---|---|
| `name` | The full name of the app. The install prompt and the splash screen show it. Required. |
| `shortName` | The name on the home screen. The default is `name`. |
| `themeColor` | A CSS color for the browser UI. Each page also gets a `theme-color` meta tag. |
| `icons` | The icons of the app, each with `src`, `sizes` and optional `type` and `purpose`. Put the files in `public/`. |

Browsers offer the install only when the manifest has a 192x192 and a 512x512 PNG icon. A `create-nuxvel` app has placeholder icons in `public/icon-192.png` and `public/icon-512.png`. Replace them with your own.

To change any other `@vite-pwa/nuxt` option, add a `pwa` key to `nuxt.config.ts`. Its values replace the values that nuxvel sets.

The [strict CSP](./security.md#security-headers) already allows the manifest and the service worker with `manifest-src 'self'` and `worker-src 'self'`. The PWA needs no change to it.

### The install prompt

```vue
<!-- app/layouts/default.vue -->
<template>
  <header class="flex items-center justify-between">
    <UButton :to="{ name: 'index' }" variant="ghost" label="Acme Blog" />
    <PwaInstallPrompt />
  </header>
  <slot />
</template>
```

`<PwaInstallPrompt>` shows an "Install app" button while the browser offers to install the app. When a new version of the app is ready, it shows a toast with a "Reload" action. The component uses Nuxt UI, so it exists only when `nuxvel.ui` is not `false`. The toast needs `<UApp>` in `app.vue`.

```vue
<script setup lang="ts">
const pwa = usePWA();
</script>

<template>
  <button v-if="pwa?.showInstallPrompt" type="button" @click="pwa.install()">Install app</button>
  <button v-if="pwa?.needRefresh" type="button" @click="pwa.updateServiceWorker(true)">Reload</button>
</template>
```

Without Nuxt UI, build the same markup from `usePWA()`. `@vite-pwa/nuxt` auto-imports it. See its [documentation](https://vite-pwa-org.netlify.app/frameworks/nuxt) for every field.

### Development

`nuxt dev` and `nuxvel dev` do not register the service worker and do not link the manifest. A service worker in development serves old files from its cache after you edit them. To test the PWA, run a production build:

```bash
npx nuxt build
set -a; . ./.env; set +a
NODE_ENV=production NUXT_SITE_URL=http://localhost:3000 NUXT_AUDIT_CHAIN_SECRET=$(openssl rand -hex 32) NUXT_OG_IMAGE_SECRET=$(openssl rand -hex 32) node .output/server/index.mjs
```

The built server does not read `.env`, so the `set -a` line loads it. `NODE_ENV=production` also needs `NUXT_REDIS_URL`, `NUXT_MAIL_URL` and the other [production variables](./deploy.md), which `.env` can hold. In production the server needs `NUXT_SITE_URL` and `NUXT_AUDIT_CHAIN_SECRET`, and it stops without them. Put them in `.env` instead when you test often.

A browser registers a service worker only on HTTPS or on `localhost`.

## Offline

The service worker precaches the app shell: the JavaScript and CSS files of the build and the `/offline` page. At runtime, it caches these requests:

| Request | Strategy | Cache |
|---|---|---|
| A page | Network first. Without a network, the cached copy, else the `/offline` page. | `nuxvel-pages` |
| An image, font, style or script from the app's origin | Stale-while-revalidate. | `nuxvel-assets` |

The service worker never stores these requests:

- Each request to `/api/**`. nuxvel also sends each `/api/**` response with `Cache-Control: private, no-store`, so the browser cache and shared caches do not keep it. To make a public answer cacheable, set `Cache-Control` in its handler or in a more specific route rule.
- A `POST` or other request that is not a `GET`, such as a tRPC mutation.
- A response whose `Cache-Control` header contains `private` or `no-store`. This includes each page with the [`private` preset](./rendering.md#rendering-presets).
- A response with a status other than 200.

Each page that the server renders for a request with a session cookie has `Cache-Control: private, no-store`. The service worker thus never stores a page that a signed-in user loads. Pages for a guest stay cacheable.

`useUser().signOut()` deletes the `nuxvel-pages` cache, so the next user of the device does not see the pages of the previous user offline. It ends the push subscription of the device in the browser, so the notifications of the previous user stop. The push service then answers 404 or 410 for the endpoint, and the next `nuxvel.push` job deletes the row.

### The offline page

```vue
<!-- app/pages/offline.vue -->
<template>
  <div>
    <h1>You are offline</h1>
    <p>Check your connection, then reload the page.</p>
    <a href="/">Go to the home page</a>
  </div>
</template>
```

The service worker shows `/offline` when a page does not load and is not in the cache. The URL in the address bar stays the same. In an app with an `app/pages/` folder, nuxvel provides a plain offline page. Add `app/pages/offline.vue` to replace it. A `create-nuxvel` app has one.

The server renders `/offline` without scripts, because the browser shows it at the URL of another page. Use links, not buttons with click handlers. `/offline` is `noindex` and stays out of `sitemap.xml`, because it is not content for a search engine.

## Push notifications

A push notification goes from your server, through the push service of the user's browser, to the service worker on the user's device. The device first subscribes with the app's public VAPID key. The server stores the subscription for the signed-in user. Later, `sendPush()` sends a notification to each device that the user subscribed.

### VAPID keys

```sh
nuxvel key:push
```

The push services accept a notification only when the server signs it with a VAPID key pair. `nuxvel key:push` writes a new pair into `.env`. When `.env` already sets one of the two keys, the command refuses and changes nothing, because new keys end every subscription. Set the subject yourself:

```
NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY=BNcR...
NUXT_PUSH_VAPID_PRIVATE_KEY=tBHI...
NUXT_PUSH_VAPID_SUBJECT=mailto:ops@example.com
```

| Variable | Value |
|---|---|
| `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` | The public key. Devices subscribe with it, so it is public runtime config. |
| `NUXT_PUSH_VAPID_PRIVATE_KEY` | The private key that signs each notification. Keep it secret. |
| `NUXT_PUSH_VAPID_SUBJECT` | A `mailto:` or `https:` URL where the push services can contact you. |

Use the same key pair for as long as the app exists. A new pair ends every subscription, so the devices must subscribe again.

### The subscriptions table

```ts
// server/database/schema/push-subscriptions.schema.ts
import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sessionTable, userTable } from "./auth.schema";
import { belongsTo, now } from "@nuxvel/nuxt/database";

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: belongsTo(userTable),
  sessionId: belongsTo(sessionTable, { nullable: true }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
}, (table) => [
  index("push_subscriptions_user_id_idx").on(table.userId),
  index("push_subscriptions_session_id_idx").on(table.sessionId),
]);
```

nuxvel stores each subscription in the `push_subscriptions` table. A `create-nuxvel` app has this table and its migration. In an existing app, add the file above, then run `nuxvel db:generate` and `nuxvel db:migrate`. The table holds user data, so also declare it for [privacy](./privacy.md#framework-tables).

### The subscription routes

With `nuxvel.pwa` set, nuxvel adds two routes for the signed-in user. `usePush()` calls them for you.

| Route | Body | Does |
|---|---|---|
| `POST /api/push/subscribe` | The `PushSubscription` of the browser, as JSON | Stores the subscription for the user and the current session. A subscription with the same endpoint moves to this user. |
| `DELETE /api/push/subscribe` | `{ "endpoint": "..." }` | Deletes the subscription of the user with this endpoint. |

Both routes answer 401 to a guest. `POST` accepts only an `https:` endpoint on the default port of one of these push-service hosts: `fcm.googleapis.com` (Google), `updates.push.services.mozilla.com` (Mozilla), `<name>.push.apple.com` (Apple) or `<name>.notify.windows.com` (Microsoft). The route also parses the endpoint with the legacy `url.parse()` of Node, because the `web-push` library sends with it. When the two parsers read a different host, the route refuses the endpoint. It allows 10 requests a minute for each user.

Each subscription belongs to the session that stored it. When that session ends (sign-out, `revokeSession`, `revokeOtherSessions` or a password reset) or expires, the device gets no more push notifications. `usePush()` and `<PushToggle>` store the subscription of the browser again when they mount for a signed-in user, so a device that signs in again gets push notifications again.

### Subscribing a device

```vue
<!-- app/pages/settings.vue -->
<template>
  <UCard>
    <template #header>Notifications</template>
    <PushToggle />
  </UCard>
</template>
```

`<PushToggle>` is a Nuxt UI switch. Turned on, it subscribes the device for the signed-in user. Turned off, it deletes the subscription. It renders nothing while `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` is not set. It is disabled when the browser blocks notifications or has no push support. The component exists only when `nuxvel.ui` is not `false`.

```vue
<script setup lang="ts">
const { isSubscribed, permission, subscribe, unsubscribe } = usePush();
</script>

<template>
  <p v-if="permission === 'denied'">Notifications are blocked in your browser settings.</p>
  <button v-else-if="!isSubscribed" type="button" @click="subscribe()">Notify me about comments</button>
  <button v-else type="button" @click="unsubscribe()">Stop notifications</button>
</template>
```

Without Nuxt UI, use `usePush()`. It is auto-imported when `nuxvel.pwa` is set.

| Name | Value |
|---|---|
| `subscribe()` | Subscribes the device with the public VAPID key and stores the subscription. The browser asks the user for permission. Resolves to `false` when the user does not allow notifications. |
| `unsubscribe()` | Deletes the subscription on the server, then in the browser. |
| `isSubscribed` | A read-only ref. `true` when this device has a subscription. |
| `permission` | A read-only ref: `"default"`, `"granted"`, `"denied"` or `"unsupported"`. |

Call `subscribe()` from a click. Browsers refuse a permission request that the user did not start. `subscribe()` throws when the public key is not set, and when no service worker is registered. In `nuxt dev` there is no service worker, so test push notifications in a production build.

The service worker shows each notification with its title, body and icon. A click on the notification focuses a tab that shows `url`, or opens a new one. A `url` on another origin opens the home page of the app.

### Sending a notification

```ts
// server/listeners/comment/notify-author.listener.ts
import { commentCreatedEvent } from "#server/events/comment/created.event";

export const commentNotifyAuthorListener = defineListener({
  event: commentCreatedEvent,
  handler: async ({ postId, postAuthorId, postTitle }) => {
    await sendPush(postAuthorId, {
      title: "New comment",
      body: `A reader commented on "${postTitle}"`,
      url: `/posts/${postId}`,
    });
  },
});
```

`sendPush(userIds, notification)` sends a notification to every device of the user. Give a list of user IDs to notify more than one user. `sendPush()` is auto-imported on the server when `nuxvel.pwa` is set.

| Field | Value |
|---|---|
| `title` | The title of the notification. Required. |
| `body` | Its text. Required. |
| `url` | The page that a click opens. The default is `/`. |
| `icon` | The URL of its icon. |

`sendPush()` validates the notification and throws a `ValidationFailedError` for a bad one. Then it dispatches the built-in `nuxvel.push` job on the `push` queue after the transaction commits. A rolled-back transaction thus sends nothing.

The `nuxvel.push` job signs each notification with the VAPID keys and sends it to each subscription of the users. Before it sends, the job checks each endpoint again with the same rules as `POST /api/push/subscribe`. It deletes a subscription that fails the check and sends nothing to it. When a push service answers 404 or 410, the subscription expired, and the job deletes it. When another delivery fails, the job fails and the queue retries it. All deliveries of one `sendPush()` share one tag. A device thus replaces a retried notification and does not show it two times.

## Testing

```ts
// eslint-disable-next-line nuxvel/test-client -- the page goes offline, so visit() would record each failed request
import { createPage, url } from "@nuxt/test-utils/e2e";
import { describe, expect, heading, it } from "@nuxvel/nuxt/testing";

describe("offline", () => {
  it("shows the offline page for a post that is not in the cache", async () => {
    const page = await createPage();

    await page.goto(url("/"), { waitUntil: "hydration" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(url("/"), { waitUntil: "hydration" });
    await page.context().setOffline(true);
    await page.goto(url("/posts/hello"));

    await expect(heading(page, "You are offline")).toBeVisible();
  });
});
```

The test app is a production build, so it registers the service worker. The first visit installs the worker. The second visit is the first one that the worker controls. `setOffline(true)` then cuts the network. The test uses `createPage()`, not `visit()`, because `visit()` would record each failed request as an error, see [Testing: login](./testing.md#login).

### Testing push notifications

```ts
import { describe, expectPushSent, it, runAction } from "@nuxvel/nuxt/testing";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("comment notifications", () => {
  it("notifies the author of the post", async () => {
    const author = await userFactory();
    const reader = await userFactory();
    const post = await postFactory({ author });

    await runAction("comments.create-comment", { postId: post.id, body: "Nice post" }, { actingAs: reader });

    await expectPushSent(author, { title: "New comment", url: `/posts/${post.id}` });
  });
});
```

A test never sends a notification to a real push service. The `nuxvel.push` job delivers to a fake push service. Each delivery goes to one subscription, so a user with no subscription gets none.

| Fixture | Use |
|---|---|
| `expectPushSent(user, match?)` | Fails unless `sendPush()` notified the user with a notification that contains the `match` fields. |
| `expectNoPushSent(user, match?)` | Fails when `sendPush()` notified the user with such a notification. |
| `fakePush.delivered()` | Resolves to each notification that the `nuxvel.push` job delivered: its `endpoint` and its `notification`. |
| `fakePush.gone(endpoint)` | Makes the fake push service answer 410 for this endpoint. The next delivery to it deletes the subscription. |

A browser test can turn on `<PushToggle>`, but a headless browser has no push service. Grant the permission with `page.context().grantPermissions(["notifications"])` and replace `PushManager.prototype.subscribe` with `page.addInitScript()`.

`expectPushSent()` sees a send after its transaction commits, when `sendPush()` dispatches the `nuxvel.push` job. The fake delivers nothing until a test runs the job with `runJob()`. The fake resets after each test. All four come from `@nuxvel/nuxt/testing`.

## See also

- [Queues](./queues.md)
- [Privacy](./privacy.md)
- [Rendering](./rendering.md)
- [Frontend](./frontend.md)
- [Security](./security.md#security-headers)
- [Testing](./testing.md)
- [Notifications](./notifications.md)
