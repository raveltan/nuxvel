# Notifications

## Introduction

A notification is a short message to one user, such as "Your post is live". You define each notification in a file, and send it with `$notifications.<name>.notify()`. The notification goes through the channels that it lists: a row in the `notifications` table, a mail, a web push, or more than one. Use a notification when one event must reach a user in more than one way.

## Defining a notification

```ts
// server/notifications/post/published.notification.ts
import { z } from "zod";

export const postPublishedNotification = defineNotification({
  input: z.object({ postId: z.number(), title: z.string() }),
  via: ["database", "mail", "push"],
  message: ({ postId, title }) => ({
    title: "Your post is live",
    body: title,
    url: `/posts/${postId}`,
  }),
  mail: $mails.notification,
});
```

Put one notification in each file under `server/notifications/`. `defineNotification` is auto-imported. nuxvel finds the file, so you do not register it. Files that end in `.test.ts` are not notifications.

The path of the file is the name of the notification. The file above is `post.published`, and `server/notifications/welcome.notification.ts` is `welcome`. A name may only hold `a-z`, `0-9`, `.`, `_` and `-`.

The auto-imported `$notifications` namespace holds each notification under its path. Each path segment is in camelCase and has no kind suffix. `$notifications.post.published` is the notification in the file above. Go to definition on `$notifications.post.published` opens the notification file. `$notifications` is available on the server only.

| Option | Use |
|---|---|
| `input` | A Zod schema for the data that `notify()` takes. |
| `via` | The channels that the notification goes through: `"database"`, `"mail"`, `"push"`. |
| `message` | Makes one message for every channel: the row that the bell shows, the web push, and the input of `mail`. |
| `mail` | The mail that the mail channel sends, as its `$mails` definition. Its input is the message. Needs `message`. |
| `toDatabase` | Makes the row that the bell shows, in place of `message`. |
| `toMail` | Picks the mail to send and its input, in place of `mail`. |
| `toPush` | Makes the web push to send, in place of `message`. |

`message` returns a `title` and a `body`, and optionally a `url` and an `icon`. Without `message`, each channel in `via` needs its own builder: `toDatabase`, `toMail` or `toPush`. With `message`, a builder replaces it for one channel, for example when the push needs another text:

```ts
message: ({ postId, title }) => ({ title: "Your post is live", body: title, url: `/posts/${postId}` }),
toPush: ({ title }) => ({ title: "Live!", body: title }),
```

Each builder gets the data after `input` parsed it, so `message` gets the typed input. A builder for a channel that `via` does not list fails `nuxt typecheck`. A missing builder for a listed channel also fails it.

### Generating a notification

```bash
nuxvel make:notification post.published
```

The command writes the notification `postPublishedNotification` at `server/notifications/post/published.notification.ts` and a functional test next to it. The notification goes through the `database` channel. See the [CLI reference](./cli.md#nuxvel-makenotification-name).

## Sending a notification

```ts
// server/actions/posts/publish-post.action.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { postTable } from "#nuxvel/schema";

export const publishPostAction = defineAction({
  input: z.object({ id: z.number() }),
  handler: async ({ id }) => {
    const post = await updateOne(postTable, id, { publishedAt: new Date() });

    await $notifications.post.published.notify(post.authorId, { postId: post.id, title: post.title });

    return post;
  },
});
```

`$notifications.<name>.notify(userIds, data)` sends the notification to one user or to several. Pass one user ID, or a list of user IDs. `$notifications` holds every notification of `server/notifications/`, keyed by its path in camelCase, and is auto-imported on the server.

`notify()` validates `data` against `input` first. Async refinements and transforms also run. Invalid data throws `ValidationFailedError`, the same error a failed action throws.

`data` has the input type of the notification's `input` schema, so wrong data fails `nuxt typecheck`. Go to definition on `published` opens the notification file.

Inside a transaction, such as in an action, the rows of the database channel are written in the transaction, and everything else waits for the commit. When the transaction rolls back, nobody is notified. Outside a transaction, all of it happens immediately.

## Channels

### The database channel

```ts
toDatabase: ({ postId, title }) => ({
  title: "Your post is live",
  body: title,
  url: `/posts/${postId}`,
  icon: "i-lucide-newspaper",
}),
```

The row holds what `message` returns, or what `toDatabase` returns when the notification has it. It has a `title` and a `body`. The `url` and the `icon` are optional. The `icon` is a Nuxt UI icon name.

`notify()` inserts one `notifications` row for each user. It writes the rows immediately, in the active transaction. When the transaction rolls back, the rows go too.

| Column | Holds |
|---|---|
| `id` | A UUID. |
| `user_id` | The user that got the notification. |
| `name` | The name of the notification, such as `post.published`. |
| `data` | The message, as JSON. |
| `read_at` | When the user read it, or `null`. |
| `created_at` | When `notify()` wrote the row. |

A new app defines the table in `server/database/schema/notifications.schema.ts`, and ships its migration. In an existing app, add the file and run `nuxvel db:generate`:

```ts
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { NotificationMessage } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";
import { belongsTo, now } from "@nuxvel/nuxt/database";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: belongsTo(userTable),
    name: text("name").notNull(),
    data: jsonb("data").$type<NotificationMessage>().notNull(),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt)],
);
```

The rows are personal data. A new app declares the table in `server/privacy/notifications.user-data.ts`, so `nuxvel user:export` and `nuxvel user:erase` include it. See [Privacy](./privacy.md).

### The mail channel

```ts
mail: $mails.notification,
```

With `mail`, the mail channel sends that [mail](./mail.md), as its `$mails` definition, with the message as its input. The input of the mail must take the message: a `title` and a `body`, and an optional `url` and `icon`. Another mail fails `nuxt typecheck`:

```ts
// server/mail/notification.mail.ts
export const notificationMail = defineMail({
  input: z.object({ to: z.email(), title: z.string(), body: z.string(), url: z.string().optional() }),
  subject: ({ title }) => title,
  template: "Notification",
});
```

`toMail` sends another mail, or the same mail with other input:

```ts
toMail: ({ postId, title }) => ({
  mail: $mails.post.published,
  input: { title, url: `https://blog.example.com/posts/${postId}` },
}),
```

`toMail` returns a [mail](./mail.md), as its `$mails` definition, and the input of that mail without `to`. The mail goes to the email address of each user. `input` is typed by that mail's schema, so a wrong input fails `nuxt typecheck`, and go to definition on `published` opens the mail file.

`notify()` builds the mail input immediately. After the commit, it dispatches the built-in `nuxvel.notification` job on the `mail` queue. `nuxvel queue:work` runs the job. The job reads the email address and the [locale](./auth.md#the-locale-of-the-user) of each user from the `user` table, and sends the mail to each one in that locale. The rules of [`send()`](./mail.md#sending-a-mail) then apply: the mail input is validated, and a suppressed address gets nothing. When the transaction rolls back, no job runs.

### The push channel

```ts
toPush: ({ postId, title }) => ({
  title: "Your post is live",
  body: title,
  url: `/posts/${postId}`,
}),
```

The push holds what `message` returns, or what `toPush` returns when the notification has it. It has the `title` and the `body` of a web push. The `url` and the `icon` are optional. A click opens the `url`, which defaults to `/`. The `icon` is the URL of an image.

`notify()` calls `sendPush()` with the users and the push. After the commit, `sendPush()` dispatches the built-in `nuxvel.push` job. The job sends the push to each device that a user subscribed with `usePush()`. A user with no subscribed device gets nothing, and the job does not fail. When the transaction rolls back, no job runs.

The push channel needs `nuxvel.pwa` in `nuxt.config.ts` and the VAPID keys. See [Push notifications](./pwa.md#push-notifications).

## Reading in the app

### The bell

```vue
<!-- app/layouts/app.vue -->
<template>
  <header>
    <nav aria-label="Main">…</nav>
    <NotificationBell />
  </header>
</template>
```

`<NotificationBell>` is a bell button for the header. A badge on it shows the number of unread notifications. A click opens a list of the 20 newest notifications, each with its icon, title, body and a relative time, such as `5 minutes ago`. When the user opens a notification, the bell marks it as read and goes to its `url`. "Mark all read" marks every notification as read.

The starter's `app` layout already has the bell. The bell renders nothing while the user is signed out. It is registered unless you set `nuxvel.ui: false`. A notification that `notify()` sends shows in the bell without a reload.

Until the first list arrives, the list shows skeletons and announces "Loading notifications…". The `loading` slot replaces them:

```vue
<NotificationBell>
  <template #loading>
    <p class="p-4 text-sm text-muted">Checking for news…</p>
  </template>
</NotificationBell>
```

### Your own markup

```vue
<script setup lang="ts">
const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
</script>

<template>
  <section aria-label="Notifications">
    <p>{{ unreadCount }} unread</p>
    <UButton label="Mark all read" @click="markAllRead()" />
    <ul>
      <li v-for="notification in notifications" :key="notification.id">
        <NuxtLink :to="notification.data.url" @click="markRead(notification.id)">
          {{ notification.data.title }}
        </NuxtLink>
        <DateTime :value="notification.createdAt" relative />
      </li>
    </ul>
  </section>
</template>
```

`useNotifications()` is auto-imported. The bell uses it too.

| Returns | Use |
|---|---|
| `notifications` | The 20 newest notifications of the signed-in user, newest first. |
| `unreadCount` | The number of unread notifications. |
| `isPending` | `true` for a signed-in user until the first list arrives. |
| `markRead(id)` | Marks one notification as read. |
| `markAllRead()` | Marks every notification of the user as read. |

Each entry is a `NotificationEntry`: `id`, `name`, `data`, `readAt` and `createdAt`. `data` is the message of the row. `readAt` and `createdAt` are ISO strings, and `readAt` is `null` while unread.

The composable reads the list in the browser only, never during SSR. It reads nothing while the user is signed out. While the component is mounted, it listens on the channel of the user. A `notify()`, or a mark-read in another tab, then updates the list without a reload.

### The notification routes

```ts
const { unreadCount, notifications } = await $fetch("/api/notifications");

await $fetch("/api/notifications/read", { method: "POST", body: { id: notification.id } });
await $fetch("/api/notifications/read", { method: "POST", body: {} });
```

nuxvel serves two routes for the signed-in user. They read and change the rows of that user only.

| Route | Does |
|---|---|
| `GET /api/notifications` | Returns `{ unreadCount, notifications }`: the 20 newest rows, newest first, and the number of unread rows. |
| `POST /api/notifications/read` | Marks the row `id` as read. Without `id`, it marks every unread row as read. Returns `{ unreadCount }`. |

Each row has `id`, `name`, `data`, `readAt` and `createdAt`. A signed-out request gets a `401`. Each route allows 60 requests per minute for each user. A request past the limit gets a `429`. See [Security](./security.md#rate-limiting).

### The notification channel

Each user has a realtime channel, `notifications:<userId>`. Only that user can listen to it. Other connections get a `403`.

The channel sends a `changed` event with an empty payload after each change:

- `notify()` wrote rows for the user, after the commit.
- The user marked a row as read.

`useNotifications()` listens for you. Without it, read `GET /api/notifications` again when the event arrives. See [Realtime](./realtime.md).

## Testing

```ts
import { describe, expectNotified, it, runAction } from "@nuxvel/nuxt/testing";
import { postFactory, userFactory } from "#nuxvel/factories";

describe("posts.publish-post", () => {
  it("tells the author that the post is live", async () => {
    const author = await userFactory();
    const post = await postFactory({ author });

    await runAction("posts.publish-post", { id: post.id }, { actingAs: author });

    await expectNotified(author, "post.published", { title: "Your post is live" });
  });
});
```

| Fixture | Use |
|---|---|
| `expectNotified(user, name, match?)` | Fails unless the notification reached the user. `match` holds fields of the message of the row, such as `title`. |
| `expectNotNotified(user, name)` | Fails when the notification reached the user. |
| `sendNotification(users, name, data)` | Runs `notify()` in the app, in a transaction, as an action would. |

A notification is recorded for each user after its transaction commits. A rolled-back `notify()` records nothing.

```ts
await sendNotification(author, "post.published", { postId: post.id, title: post.title });

await expectNotified(author, "post.published", { body: post.title });
```

`sendNotification()` tests a notification apart from the code that sends it. The test that `nuxvel make:notification` writes uses it. Invalid data rejects with a `BAD_REQUEST` validation error.

Each fixture also takes a notification definition or its name stub in place of the name. A test file imports the stubs from `#nuxvel/test-namespaces`.

```ts
import { $notifications } from "#nuxvel/test-namespaces";

await expectNotified(author, $notifications.post.published, { title: "Your post is live" });
```

The mail of a notification goes through the `nuxvel.notification` job, and no functional test runs that job. To test the mail, run the job with `runJob()`, then assert with `expectMailSent()`:

```ts
await runJob("nuxvel.notification", {
  userIds: [author.id],
  mail: { mail: "post.published", data: { title: post.title, url: postUrl } },
});

await expectMailSent("post.published", { to: author.email });
```

The push of a notification goes through `sendPush()`. Assert it with `expectPushSent()`:

```ts
await sendNotification(author, "post.published", { postId: post.id, title: post.title });

await expectPushSent(author, { title: "Your post is live" });
```

To deliver the push, run the `nuxvel.push` job with `runJob()` and read `fakePush.delivered()`. See [Testing push notifications](./pwa.md#testing-push-notifications).

The fixtures come from `@nuxvel/nuxt/testing`. See [Testing](./testing.md).

## See also

- [Mail](./mail.md)
- [Progressive web app](./pwa.md)
- [Queues](./queues.md)
- [Privacy](./privacy.md)
- [Realtime](./realtime.md)
- [Frontend](./frontend.md)
- [Testing](./testing.md)
