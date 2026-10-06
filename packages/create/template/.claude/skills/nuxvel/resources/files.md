# Files and names

nuxvel discovers each file. Never register one. The path gives the name: folders join with `.`, the kind suffix drops. One named export per file, ending in the kind.

| File | Export | Name |
|---|---|---|
| `server/database/schema/post.schema.ts` | `postTable`, `PostRow`, `NewPostRow` | SQL table `post` |
| `shared/schemas/post.ts` | `createPostInput`, `updatePostInput`, `postIdInput`, `postSchema` | auto-imported in `app/` + `server/` |
| `server/actions/posts/create-post.action.ts` | `createPostAction` (file name only) | `posts.create-post`, `$actions.posts.createPost` |
| `server/trpc/routers/post.router.ts` | `postRouter` | `trpc.post.*` |
| `server/policies/post.policy.ts` | `postPolicy` | `$policies.post` |
| `server/jobs/post/notify.job.ts` | `postNotifyJob` | `post.notify`, `$jobs.post.notify` |
| `server/events/post/published.event.ts` | `postPublishedEvent` | `post.published`, `$events.post.published` |
| `server/listeners/post/notify-subscribers.listener.ts` | `postNotifySubscribersListener` | `post.notify-subscribers` |
| `server/mail/post/published.mail.ts` | `postPublishedMail` | `post.published`, `$mails.post.published` |
| `server/notifications/post/published.notification.ts` | `postPublishedNotification` | `post.published`, `$notifications.post.published` |
| `server/channels/posts.channel.ts` | `postsChannel` | `posts`, `$channels.posts` |
| `server/uploads/post-cover.upload.ts` | `postCoverUpload` | `POST /api/uploads/post-cover` |
| `server/webhooks/billing.webhook.ts` | `billingWebhook` | `POST /api/webhooks/billing` |
| `server/flags/new-editor.flag.ts` | `newEditorFlag` | `new-editor`, `$flags.newEditor` |
| `server/flags/subscribe-button.experiment.ts` | `subscribeButtonExperiment` | `subscribe-button`, `$experiments.subscribeButton` |
| `server/schedules/posts/prune-drafts.schedule.ts` | `postsPruneDraftsSchedule` | `posts.prune-drafts` |
| `server/database/backfills/posts-content.backfill.ts` | `postsContentBackfill` | `posts-content` |
| `server/seeders/database.seeder.ts` | `databaseSeeder` | `database` |
| `server/factories/post.factory.ts` | `postFactory` | |
| `server/privacy/posts.user-data.ts` | `postsUserData` | |
| `app/pages/post/[id].vue` | | route `post-id` |
| `app/pages/post/index.vue` | | route `post` |
| `app/pages/(app)/settings.vue` | | route `settings`, signed-in users only |

- Kebab-case segment → camelCase key: `audit-log.router.ts` → `trpc.auditLog`, `admin/users.router.ts` → `trpc.admin.users`.
- `$`-namespaces are server only. In `app/`, `$jobs`, `$channels`, `$flags`, `$experiments` hold only the name.
- `*.test.ts` sits next to its file. Discovery skips it.

## Domain folders

`server/domains/<domain>/<kind>/...` = `server/<kind>/<domain>/...`. Kinds: `actions`, `jobs`, `events`, `listeners`, `mail`, `notifications`, `channels`, `flags`, `schedules`, `uploads`, `backfills`, `policies`, `routers`, `schema`, `factories`. Suffix required. `routers/order.router.ts` in domain `order` is `trpc.order`.

## Server-only modules

`#nuxvel/schema` (all tables), `#nuxvel/factories`. A value import of `#nuxvel/*` from `app/` fails the build. `import type` works.
