# Server auto-imports

## Introduction

Every name on this page is auto-imported in `server/`. You use it without an import line. Each table lists the names of one guide.

No other name from nuxvel is auto-imported. The helpers that nuxvel uses internally, such as the tRPC instance, the registries and the test recorders, stay out of your global scope. A name you did not write cannot resolve by accident.

The exports of `shared/schemas/` are also auto-imported, in `server/` and in the app. The pagination names are also auto-imported in the app. So are `SanitizedHtml` and `richText`, which are also auto-imported in `shared/`. For app-side names, such as `$api`, `useUser()` and `useFlag()`, see [Frontend](./frontend.md) and [Calling from the client](./api.md#calling-from-the-client). For `useMaintenance()` and `isMaintenanceError()`, see [Maintenance mode](./maintenance.md#in-the-app). For `isNetworkError()`, see [When the server cannot be reached](./api.md#when-the-server-cannot-be-reached). Test fixtures are not auto-imported. Import them from `@nuxvel/nuxt/testing`, as [Testing](./testing.md) shows.

## Imports

Import your own code through aliases, never through `../`:

| Alias | Points to |
|---|---|
| `#nuxvel/schema` | Every table of `server/database/schema/`. |
| `#nuxvel/factories` | Every factory of `server/factories/`. |
| `#server/*` | `server/`: `#server/utils/slug`. |
| `#shared/*` | `shared/`: `#shared/slug`. |

```ts
import { userTable } from "#nuxvel/schema";
import { slugify } from "#server/utils/slug";
import { postSlugLength } from "#shared/post";
```

`#server` is not allowed in `app/`: server code must not reach the browser bundle. Use `#shared/*` for code that both sides share.

The ESLint rule `nuxvel/no-parent-imports` of `@nuxvel/nuxt/eslint` reports an import that climbs with `../` out of its kind folder (`server/actions/`, `server/database/schema/`, `server/domains/<domain>/<kind>/`, `app/components/`, `shared/schemas/`, `tests/`) into another one. `eslint --fix` rewrites it to the alias: a table to `#nuxvel/schema` and a factory to `#nuxvel/factories` (named imports only), other server code to `#server/*`, `shared/` to `#shared/*`, `app/` to `~/*` and a module to `#layers/<name>/*`. A relative import inside one kind folder, such as `../tags/create-tag.action` in `server/actions/posts/`, stays legal, and so does one from a table file to another table file or from a factory file to another factory file, whatever their folders (drizzle-kit loads them on their own). In `app/` and `server/`, the rule also reports an import of a file in `shared/schemas/`, whose exports are auto-imported there, and `--fix` removes it. It leaves such an import in tests, stories, tables and factories, which run without auto-imports. The `allow` option lists the targets, relative to the app root, that a relative import may still reach:

```ts
// eslint.config.ts
import { nuxvelPlugin } from "@nuxvel/nuxt/eslint";

export default [
  {
    files: ["server/**/*.ts", "app/**/*.{ts,vue}", "shared/**/*.ts", "tests/**/*.ts"],
    plugins: { nuxvel: nuxvelPlugin },
    rules: { "nuxvel/no-parent-imports": ["error", { allow: ["server/utils/**"] }] },
  },
];
```

`nuxvel upgrade --only imports` makes the same rewrite in every file of the app, see [`nuxvel upgrade`](./cli.md#nuxvel-upgrade).

## Naming scheme

The form of a name tells you what the name does:

| Form | Meaning | Examples |
|---|---|---|
| `use*` | returns a handle that you call methods on | `useDb()`, `useLogger()`, `useQueue()` |
| `current*` | returns an ambient value of the running request or action | `currentRequestId()` |
| `define*` | defines one discovered file, as a named export with the kind at the end (`postNotifySubscribersJob`) | `defineAction()`, `defineJob()`, `definePolicy()` |
| a verb | does one thing now | `authorize()`, `audit()`, `sendMailNow()`, `flash()` |
| a noun | reads a value and changes nothing | `flagTargeting()`, `experimentReport()`, `signedReadUrl()` |

`useBucket()` does not follow the scheme. It returns the name of the bucket, not a handle.

## File names

A definition file name ends with the kind of its folder: `server/jobs/post/notify-subscribers.job.ts`, `server/actions/posts/create-post.action.ts`, `server/policies/posts.policy.ts`. The file exports its definition as a named export whose name ends with the same kind: `export const postNotifySubscribersJob = defineJob(...)`. The `make:*` generators write both. The generated export name is the camelCase of the full definition name plus the kind. An action export uses only the file name, for example `createPostAction`. The definition name does not include the suffix, so this file is the job `"post.notify-subscribers"`.

Old file names keep working. A file without the suffix, such as `notify-subscribers.ts`, has the same name. A default export is also valid. `nuxvel test:arch` warns about a definition file without the suffix. [Conventions](./index.md#names-come-from-paths) gives the full rule.

## Domain folders

A domain folder keeps the files of one domain together: `server/domains/<domain>/`. In it, each kind has a folder with the same name as its kind folder under `server/`:

```
server/domains/order/
  actions/cancel-order.action.ts       # action "order.cancel-order"
  actions/cancel-order.action.test.ts
  jobs/notify-courier.job.ts           # job "order.notify-courier", $jobs.order.notifyCourier
  jobs/notify-courier.job.test.ts
  events/shipped.event.ts              # event "order.shipped"
  listeners/send-receipt.listener.ts   # listener "order.send-receipt"
  policies/shipment.policy.ts          # $policies.order.shipment
  routers/shipments.router.ts          # tRPC namespace order.shipments
  schema/orders.schema.ts              # ordersTable
  factories/orders.factory.ts          # ordersFactory
  factories/orders.factory.test.ts
```

The name of a file is the domain, then its path under the kind folder, without the suffix. Thus `server/domains/order/jobs/notify-courier.job.ts` has the same name as `server/jobs/order/notify-courier.job.ts`. A router or a policy file with the name of its domain is the domain itself, so `routers/order.router.ts` is `order`, not `order.order`. Such a file must be the only file of its kind in the domain, because the domain name cannot be a definition and a folder of definitions at the same time. Otherwise the build stops.

The kind folders are `actions`, `jobs`, `events`, `listeners`, `mail`, `notifications`, `channels`, `flags`, `schedules`, `uploads`, `backfills`, `policies`, `routers`, `schema` and `factories`. The app-wide kinds, such as seeders and webhooks, stay in their folder under `server/`. A file in a domain folder must have the kind suffix. Discovery skips `*.test.ts` files, so keep each test next to the file that it tests. This also applies to factories and their tests.

The kind folders under `server/` stay valid, and one app can use the two layouts. One name in the two places of one layer stops the build. `#nuxvel/schema` and `#nuxvel/factories` include the domain tables and factories. The `drizzle.config.ts` of a new app lists `./server/domains/*/schema/**/*.schema.ts` beside `./server/database/schema/**/*.ts`, so `nuxvel db:generate` sees the domain tables. Keep that glob when you edit the file. To write a file into a domain folder, give `--domain` to a `make:*` command, as the [CLI reference](./cli.md#generators) shows.

## Names

Guide: [Renaming a definition](./index.md#renaming-a-definition).

| Name | Kind | Description |
|---|---|---|
| `renamed` | function | Keeps a moved definition answering to the name its old path gave it. |

## Database

Guide: [Database](./database.md).

| Name | Kind | Description |
|---|---|---|
| `useDb` | function | Returns the Drizzle client, or the active transaction inside one. |
| `timestamps` | function | Adds `created_at` and `updated_at` columns to a table. |
| `now` | function | Returns the current time, which the test clock can move. |
| `findOrFail` | function | Loads one row by its `id`, or throws `NotFoundError`. |
| `insertOne` | function | Inserts one row and returns it. |
| `updateOne` | function | Updates the row with an `id` and returns it, or throws `NotFoundError`. |
| `loader` | function | Batches `load(id)` calls made in the same tick into one query. |
| `chunkById` | function | Walks a table in `id` order, a chunk of rows at a time. |
| `firstOrFail` | function | Takes the first row of a result, or throws `NotFoundError`. |
| `softDeletes` | function | Adds a nullable `deleted_at` column to a table. |
| `notTrashed` | function | A `where` condition that keeps only the rows that are not soft-deleted. |
| `onlyTrashed` | function | A `where` condition that keeps only the soft-deleted rows. |
| `softDelete` | function | Sets `deletedAt` on the row with an `id`, or on the matching rows, and returns them. |
| `restore` | function | Clears `deletedAt` on the row with an `id`, or on the matching rows, and returns them. |
| `forceDelete` | function | Deletes the row with an `id`, or the matching rows, permanently and returns them. |
| `purgeTrashed` | function | Deletes the rows that were trashed longer ago than an interval, in every table with `softDeletes()`. |
| `paginate` | function | Runs one page of a select and counts the rows on all pages. |
| `paginateCursor` | function | Runs one page of a select by key and returns the cursor of the next page. |
| `search` | function | Returns a `where` condition that matches the rows of a searchable table. |
| `searchRank` | function | Returns the full-text search rank of each row, for `orderBy`. |
| `paginationSchema` | schema | The input of a paginated list: an optional `page`, `perPage` and `q` search text. |
| `paginated` | function | Builds the Zod schema of one page of rows, for the `.output()` of a procedure that returns `paginate()`. |
| `PaginationInput` | type | The input that `paginationSchema` parses. |
| `listQuery` | function | Builds the input schema of a list that sorts and filters on the server. |
| `listQueryParams` | function | Turns a parsed `listQuery()` input back into flat query parameters. |
| `listWhere` | function | Returns the `where` condition of the active filters of a `listQuery()` input. Server only. |
| `listOrderBy` | function | Returns the `orderBy` terms of the sort of a `listQuery()` input. Server only. |
| `ListQuery` | type | The parsed input of `listQuery()`. |
| `ListSort` | type | The sort of a parsed `listQuery()` input. |
| `ListFilterKind` | type | The kind of one filter of a `listQuery()`. |
| `ListFilters` | type | The active filters of a parsed `listQuery()` input. |
| `Paginated` | type | One page of rows and where it sits in the full list, as `paginate()` returns it. |
| `CursorPage` | type | One page of rows by key and the cursor of the next page, as `paginateCursor()` returns it. |
| `highlight` | function | Returns an escaped HTML snippet of a text column with the matches in `<mark>` tags. |
| `transaction` | function | Runs a function in a database transaction. |
| `onCommit` | function | Runs a function after the surrounding transaction commits. |
| `beforeCommit` | function | Runs a function inside the transaction, immediately before it commits. |
| `allowRepeatedQueries` | function | Turns off the N+1 warning for the queries of a function. |
| `NuxvelDb` | type | The Drizzle client type that `useDb()` returns outside a transaction. |
| `NuxvelTx` | type | The transaction handle that a `transaction()` callback gets. |
| `TableId` | type | The value type of a table's `id` column. |

## API

Guide: [API](./api.md).

| Name | Kind | Description |
|---|---|---|
| `publicProcedure` | procedure | Builds a procedure that needs no session. |
| `authedProcedure` | procedure | Builds a procedure that needs a signed-in user, or throws `UNAUTHORIZED`. |
| `roleProcedure` | function | Builds a procedure that needs a signed-in user with one of the given roles, or throws `FORBIDDEN`. It refuses API keys unless you pass `{ apiKeys: true }`. |
| `adminProcedure` | procedure | Builds a procedure that needs a signed-in admin with two-factor sign-in on, or throws `FORBIDDEN`. |
| `freshProcedure` | procedure | Builds a procedure that needs a sign-in in the last 10 minutes, or throws `FORBIDDEN`. |
| `signedProcedure` | procedure | Builds a procedure for a signed link that needs no sign-in. It throws `FORBIDDEN` for an invalid link and runs the body as a system actor. |
| `idempotent` | function | tRPC middleware that runs a mutation once per `Idempotency-Key` and answers repeats with the first result. |
| `useCaller` | function | Returns an in-process caller for the app router, with no HTTP. |
| `currentRequestId` | function | Returns the id of the current request, or `undefined` outside one. |
| `AppRouter` | type | The type of the app router, which the client uses. |
| `TRPCContext` | type | The context every procedure gets. |

## Internationalization

Guide: [Internationalization: the locale on the server](./i18n.md#the-locale-on-the-server).

| Name | Kind | Description |
|---|---|---|
| `currentLocale` | function | Returns the locale of the current request or action, or the default locale outside one. |

## Errors

Guide: [API: errors](./api.md#errors).

| Name | Kind | Description |
|---|---|---|
| `TaxonomyError` | class | The base class of every taxonomy error, with a fixed code and HTTP status. |
| `ValidationFailedError` | class | Input failed its Zod schema. |
| `NotFoundError` | class | The requested row does not exist. |
| `ConflictError` | class | The write clashes with existing state. |
| `RateLimitedError` | class | The caller sent too many requests. |
| `TransientError` | class | A dependency is temporarily unavailable. |
| `UnknownError` | class | An unclassified failure. |
| `ForbiddenError` | class | A policy denies the actor. `authorize()` throws it. |
| `UnauthenticatedError` | class | The request has no session. `requireAuth()` throws it. |
| `isTaxonomyError` | function | Narrows an unknown error to the taxonomy error with a given code. |
| `defineErrorClassifier` | function | Defines an error classifier that maps a library's errors into the taxonomy, named after its file. |
| `toValidationError` | function | Turns a `ZodError` into the validation error shape, without throwing. |
| `defineValidatedHandler` | function | Defines a Nitro route handler that validates its params, query and body with Zod, and types `$fetch` to it. See [Validation](./validation.md#validating-a-plain-route). |
| `TaxonomyCode` | type | The tRPC codes that the taxonomy errors use. |
| `ValidationError` | type | The shape of a failed validation: messages keyed by field path. |
| `ErrorClassifier` | type | An error classifier from `defineErrorClassifier()`. |
| `RequestSchemas` | type | The `params`, `query` and `body` schemas that `defineValidatedHandler()` takes. |
| `ValidatedRequest` | type | The parsed `params`, `query` and `body` that the handler of `defineValidatedHandler()` gets. |
| `ValidatedHandler` | type | The event handler that `defineValidatedHandler()` returns. |

## Actions

Guide: [Actions](./actions.md).

| Name | Kind | Description |
|---|---|---|
| `defineAction` | function | Defines an action: one validated, transactional unit of work. |
| `ActionError` | class | The error an action's `fail(code)` throws. |
| `isActionError` | function | Narrows an unknown error to an `ActionError`. |
| `systemActor` | function | Returns an actor for work with no user, such as a job or a script. |
| `userActor` | function | Returns an actor for a user, with the `role` that policy rules check. |
| `apiKeyActor` | function | Returns an actor for an API key, with the `userId` of the key's owner. |
| `$actions` | namespace | Holds each action definition under its path: `$actions.posts.createPost`. Server only. |
| `Action` | type | An action from `defineAction`. |
| `ActionContext` | type | The second argument of an action: who performs it. |
| `InvalidationTag` | type | What an action's `invalidates` forgets: a string, a key array or a glob. |
| `ActionErrorCode` | type | The union of the error codes an action declares. |
| `Actor` | type | Who performs an action: a user, the system or another caller type. |

## Auth

Guide: [Auth](./auth.md).

| Name | Kind | Description |
|---|---|---|
| `requireAuth` | function | Returns the session of the current request, or throws `UnauthenticatedError`. |
| `useAuth` | function | Returns `{ user, actor }` of the running action, procedure or request, each `null` when nobody is signed in. |
| `SessionUser` | type | The signed-in user: Better Auth's user fields plus `role`. |

## Flash messages

Guide: [Frontend: flash messages](./frontend.md#flash-messages).

| Name | Kind | Description |
|---|---|---|
| `flash` | function | Stores a message for the next page load only. |

## Authorization

Guide: [Authorization](./authorization.md).

| Name | Kind | Description |
|---|---|---|
| `definePolicy` | function | Defines the authorization rules for one table. |
| `allowSystem` | function | Lets system actors reach a rule. |
| `allowGuest` | function | Lets the guest actor of a signed-out caller reach a rule. |
| `can` | function | Tells whether the actor may perform an action on a row. |
| `canMany` | function | Checks several actions on every row of a list, with one preload for the list. |
| `authorize` | function | Throws `ForbiddenError` when the actor may not perform an action on a row. |
| `findAuthorized` | function | Loads one row by its `id` and authorizes an action on it, or throws `NotFoundError` or `ForbiddenError`. |
| `withAbilities` | function | Extends a row schema for `.output()` with `can`, the answers of a list of ability refs for the caller. |
| `$policies` | namespace | Holds each policy under the path of its file: `$policies.post.update`. Server only. |
| `Policy` | type | A table's rules, as `definePolicy()` returns them. |
| `PolicyRule` | type | One rule: a function of the actor, the row and the preloaded data. |
| `PolicyPreload` | type | A policy's `preload`: loads what the rules need for a list of rows. |
| `PolicyAction` | type | The rule names that `can()` and `authorize()` accept for a table. |
| `AbilityRef` | type | One rule of a policy, such as `postPolicy.update`, that `can()` and `authorize()` accept in place of the rule name and the table. |

## Events

Guide: [Events](./events.md).

| Name | Kind | Description |
|---|---|---|
| `defineEvent` | function | Defines a domain event. |
| `defineListener` | function | Defines a listener that reacts to an event. |
| `$events` | namespace | Holds each event definition under its path: `$events.post.published`. `$events.post.published.emit(payload)` emits it: it runs the `sync` listeners at once and queues the other listeners after the surrounding transaction commits. Server only. |
| `$listeners` | namespace | Holds each listener definition under its path: `$listeners.post.notifySubscribers`. Server only. |
| `DomainEvent` | type | An event definition. |
| `Listener` | type | A listener definition. |
| `EventName` | type | The name of every event under `server/events/`. |
| `EventPayload` | type | The payload that the listeners of an event receive. |

## Queues

Guide: [Queues](./queues.md).

| Name | Kind | Description |
|---|---|---|
| `defineJob` | function | Defines a background job that `nuxvel queue:work` runs. |
| `defineSchedule` | function | Defines a task that `nuxvel queue:work` runs on a clock. |
| `relayOutbox` | function | Adds every waiting `outbox` row to the queue. |
| `pruneOutbox` | function | Deletes the `outbox` rows that reached the queue longer ago than an interval. |
| `useQueue` | function | Returns the BullMQ queue of a named queue, `default` when no name is given. |
| `$jobs` | namespace | Holds each job definition under its path: `$jobs.post.notifyFollowers`. `$jobs.post.notifyFollowers.dispatch(input)` queues it after the surrounding transaction commits. In the app, each key holds only the job name, for `useJobChannel()`. |
| `Job` | type | A job definition. |
| `JobContext` | type | What a job's handler gets besides its input. |
| `JobChannel` | type | Who may follow a job on its channel. |
| `Schedule` | type | A schedule definition. |
| `JobName` | type | The name of every job under `server/jobs/`, `nuxvel.mail` and `nuxvel.notification` included. |
| `JobInput` | type | The input a job is dispatched with. |
| `DispatchOptions` | type | The `delay`, `priority` and `dispatcher` options of `$jobs.<name>.dispatch()`. |
| `JobChannelName` | type | The name of every job that has a `channel`. |
| `JobMessage` | type | What a job broadcasts on its channel. |
| `ScheduleName` | type | The name of every schedule under `server/schedules/`. |

## Mail

Guide: [Mail](./mail.md).

| Name | Kind | Description |
|---|---|---|
| `defineMail` | function | Defines a mail: a Vue template rendered to HTML. |
| `sendMailNow` | function | Sends a mail now, without the queue. |
| `suppressMail` | function | Puts an address on the suppression list. |
| `defineMailWebhook` | function | Defines the webhook that suppresses bounced and complaining addresses of Resend or Mailgun. |
| `isMailSuppressed` | function | Tells whether an address is on the suppression list. |
| `$mails` | namespace | Holds each mail definition under its path: `$mails.welcome`. `$mails.welcome.send(input)` sends it after the surrounding transaction commits. Server only. |
| `Mail` | type | A mail definition. |
| `MailSchema` | type | The input every mail schema must produce, `to` included. |
| `RenderedMail` | type | A rendered mail body: the HTML part and its plain-text version. |
| `MailI18n` | type | What the `subject` of a mail gets next to its input: `t` and `locale`. |
| `SendMailOptions` | type | The options of `$mails.<name>.send()` and `sendMailNow()`: `locale`. |
| `MailName` | type | The name of every mail under `server/mail/`. |
| `MailInput` | type | The input a mail is sent with. |
| `MailSuppressionReason` | type | Why an address stopped receiving mail. |
| `MailWebhookProvider` | type | A provider name that `defineMailWebhook()` takes. |

## Notifications

Guide: [Notifications](./notifications.md).

| Name | Kind | Description |
|---|---|---|
| `defineNotification` | function | Defines a notification and the channels it goes through. |
| `$notifications` | namespace | Holds each notification definition under its path: `$notifications.welcome`. `$notifications.welcome.notify(userIds, data)` sends it to one user or to several. Server only. |
| `Notification` | type | A notification definition. |
| `NotificationChannel` | type | A channel a notification goes through: `database`, `mail` or `push`. |
| `NotificationMessage` | type | What `toDatabase` returns: the title, body, URL and icon of the row. |
| `NotificationMail` | type | What `toMail` returns: a mail name and its input without `to`. |
| `NotificationName` | type | The name of every notification under `server/notifications/`. |
| `NotificationData` | type | The data a notification is sent with. |

## Push notifications

Guide: [Progressive web app](./pwa.md#push-notifications). These names are auto-imported only when `nuxvel.pwa` is set.

| Name | Kind | Description |
|---|---|---|
| `sendPush` | function | Sends a web push notification to the devices of one or more users after the surrounding transaction commits. |
| `PushNotification` | type | The title, body, `url` and `icon` of a push notification. |

## Billing

Guide: [Billing](./billing.md). These names are auto-imported only when `nuxvel.billing` is on, except `$products`.

| Name | Kind | Description |
|---|---|---|
| `useStripe` | function | Returns the app's Stripe client. |
| `defineProduct` | function | Defines a product that a user can buy: a Stripe price and whether it renews. |
| `Product` | type | A product definition. |
| `ProductName` | type | The name of every product under `server/products/`. |
| `checkout` | function | Starts a Stripe Checkout for one product and returns its URL. |
| `CheckoutOptions` | type | The `successUrl` and `cancelUrl` of a checkout. |
| `billingPortal` | function | Opens the Stripe Customer Portal of a user and returns its URL. |
| `BillingUser` | type | The user who pays: their `id` and `email`. |
| `subscribed` | function | Whether a user has a subscription that gives access, to one product or to any. |
| `billingSubscriptionChangedEvent` | event | Emitted when Stripe reports a change to a user's subscription. |
| `paid` | function | Whether a user paid for a one-time product and keeps it. |
| `billingPaidEvent` | event | Emitted once when Stripe confirms a one-time payment. |
| `billingRefundedEvent` | event | Emitted when Stripe reports a refund of a one-time payment. |
| `billingDisputedEvent` | event | Emitted when the user's bank disputes a one-time payment. |
| `$products` | namespace | Holds each product under the path of its file: `$products.pro`. Server only. |

## Storage

Guide: [Storage](./storage.md).

| Name | Kind | Description |
|---|---|---|
| `useS3` | function | Returns the app's S3 client. |
| `useBucket` | function | Returns the name of the app's bucket. |
| `defineUpload` | function | Defines a kind of file that the browser sends to storage. |
| `promoteUpload` | function | Moves an uploaded file from `tmp/` to a permanent key. |
| `checkUpload` | function | Checks an uploaded file in `tmp/` and does not move it. |
| `deleteStoredFiles` | function | Deletes files from the bucket after the transaction commits. |
| `signedReadUrl` | function | Returns a presigned URL that reads a file for 10 minutes. |
| `Upload` | type | An upload definition. |
| `UploadRequest` | type | What an upload's `authorize` sees. |
| `PresignedUpload` | type | What the upload endpoint returns for an accepted request. |
| `SvgHandling` | type | What `promoteUpload()` does with an SVG file. |
| `FileSize` | type | A `maxSize` of an upload: bytes, or a size such as `"2 MB"`. |
| `PromoteUploadOptions` | type | Where `promoteUpload()` moves a file from and to. |
| `CheckUploadOptions` | type | Which uploaded file `checkUpload()` checks. |
| `UploadName` | type | The name of every upload under `server/uploads/`. |

## Webhooks

Guide: [Webhooks](./webhooks.md).

| Name | Kind | Description |
|---|---|---|
| `defineWebhook` | function | Defines an endpoint that a provider posts events to. |
| `hmac` | function | Returns a `verify` function that checks a hex HMAC-SHA256 header. |
| `sendWebhook` | function | Posts an event to every outbound webhook endpoint after the surrounding transaction commits. |
| `addWebhookEndpoint` | function | Adds an outbound webhook endpoint and returns its signing secret. |
| `listWebhookEndpoints` | function | Lists the outbound webhook endpoints without their secrets. |
| `removeWebhookEndpoint` | function | Removes an outbound webhook endpoint. |
| `WebhookEndpoint` | type | An outbound webhook endpoint without its secret. |
| `Webhook` | type | A webhook definition. |
| `WebhookRequest` | type | What a webhook's `verify` sees. |
| `WebhookDelivery` | type | What a webhook's `handler` sees. |
| `WebhookName` | type | The name of every webhook under `server/webhooks/`. |
| `WebhookProvider` | type | A provider name that `verify` takes, such as `"stripe"`. |
| `WebhookVerifier` | type | A function that checks the signature of a delivery. |

## Realtime

Guide: [Realtime](./realtime.md).

| Name | Kind | Description |
|---|---|---|
| `defineChannel` | function | Defines a channel of server-sent events. |
| `$channels` | namespace | Holds each channel definition under its path: `$channels.posts`. `$channels.posts.broadcast(event, payload)` sends an event to every connection on it after the surrounding transaction commits. In the app, each key holds only the channel name, for `useChannel()` and `usePresence()`. |
| `Channel` | type | A channel definition. |
| `ChannelConnection` | type | What a channel's `authorize` sees. |
| `ChannelEvents` | type | The events a channel carries, one schema per event. |
| `ChannelUser` | type | The signed-in user that a channel's `authorize` sees. |
| `ChannelName` | type | The name of every channel under `server/channels/`, `flags` and `maintenance` included. |
| `ChannelEvent` | type | The events a channel declares. |
| `BroadcastPayload` | type | The payload that `broadcast()` takes for an event. |
| `ChannelMessage` | type | What a listener on a channel receives. |
| `defineStreamHandler` | function | Defines a route that answers with its own server-sent event stream. |
| `StreamWriter` | type | What a `defineStreamHandler()` handler writes to. |
| `StreamMessage` | type | One event that a `defineStreamHandler()` handler sends. |
| `presenceOf` | function | Returns the members of one presence room of a channel. |
| `ChannelPresence` | type | The `presence` option of a channel. |
| `PresenceChannelName` | type | The name of every channel that sets `presence`. |
| `PresenceMember` | type | One user in a presence room, with their state and number of tabs. |
| `PresenceParams` | type | The params that select a presence room, such as `{ id: 42 }`. |
| `PresenceState` | type | The state that a member of a presence channel shares. |

## Feature flags

Guide: [Feature flags](./flags.md).

| Name | Kind | Description |
|---|---|---|
| `defineFlag` | function | Defines a feature flag. |
| `defineExperiment` | function | Defines an A/B experiment. |
| `flag` | function | Tells whether a flag is on for the current user. |
| `experiment` | function | Returns the variant of an experiment for the current user. |
| `track` | function | Records a conversion on a metric for the current user. |
| `nuxvelFlagProvider` | function | Returns an OpenFeature server provider that reads the flags and experiments. |
| `$flags` | namespace | Holds each flag definition under its path: `$flags.newEditor`. In the app, each key holds only the flag name, for `useFlag()`. |
| `$experiments` | namespace | Holds each experiment definition under its path: `$experiments.checkoutCta`. In the app, each key holds only the experiment name, for `useExperiment()`. |
| `flagTargeting` | function | Returns the stored targeting of a flag. |
| `setFlagTargeting` | function | Replaces the targeting of a flag, with no deploy. |
| `experimentState` | function | Returns the stored state of an experiment. |
| `startExperiment` | function | Starts an experiment. |
| `stopExperiment` | function | Stops an experiment. |
| `experimentReport` | function | Returns the results of an experiment so far. |
| `Flag` | type | A flag definition. |
| `Experiment` | type | An experiment definition. |
| `FlagSubject` | type | Who a flag or experiment is evaluated for. |
| `FlagName` | type | The name of every flag under `server/flags/`. |
| `ExperimentName` | type | The name of every experiment under `server/flags/`. |
| `ExperimentMetric` | type | Every metric an experiment lists. |
| `ExperimentVariant` | type | The variants of an experiment. |
| `FlagTargeting` | type | Who a flag is on for. |
| `ExperimentState` | type | Whether an experiment runs, and its locked weights. |
| `ExperimentReport` | type | What `experimentReport()` returns. |
| `MetricResult` | type | The conversions of one metric in one variant. |

## Backfills

Guide: [Backfills](./backfills.md).

| Name | Kind | Description |
|---|---|---|
| `defineBackfill` | function | Defines a resumable data migration that walks a table in batches. |
| `runBackfill` | function | Runs a backfill to completion. |
| `$backfills` | namespace | Holds each backfill definition under its path: `$backfills.postsContent`. Server only. |
| `Backfill` | type | A backfill definition. |
| `BackfillName` | type | The name of every backfill under `server/database/backfills/`. |

## Seeders

Guide: [Seeding](./database.md#seeding).

| Name | Kind | Description |
|---|---|---|
| `defineSeeder` | function | Defines a seeder that fills the database with development or demo data. |
| `$seeders` | namespace | Holds each seeder definition under its path: `$seeders.database`. Server only. |
| `Seeder` | type | A seeder definition. |
| `SeederContext` | type | What a seeder gets: `call()`, which runs other seeders. |
| `SeederName` | type | The name of every seeder under `server/seeders/`. |

## Audit log

Guide: [Audit log](./audit.md).

| Name | Kind | Description |
|---|---|---|
| `audit` | function | Writes an audit-log row for the actor in scope. |
| `verifyAuditChain` | function | Checks the hash chain of `audit_log` and returns the first break. |
| `maintainAuditPartitions` | function | Creates the coming monthly partitions and drops the expired ones. |
| `AuditChainBreak` | type | Where `verifyAuditChain()` found a break. |

## Privacy

Guide: [Privacy](./privacy.md).

| Name | Kind | Description |
|---|---|---|
| `defineUserData` | function | Declares which rows of a table are a user's personal data. |
| `exportUserData` | function | Collects a user's personal data, keyed by table name. |
| `eraseUserData` | function | Deletes a user's personal data in one transaction. |

## Redis

Guide: [Redis](./redis.md).

| Name | Kind | Description |
|---|---|---|
| `useRedis` | function | Returns the app's Redis client for one purpose. |
| `redisKey` | function | Returns a Redis key under the app's key prefix, `NUXT_REDIS_PREFIX`. |
| `RedisPurpose` | type | What a Redis connection is used for. |

## Cache

Guide: [Cache](./cache.md).

| Name | Kind | Description |
|---|---|---|
| `remember` | function | Returns a cached value, or computes, stores and returns it. |
| `cacheGet` | function | Reads a cached value. |
| `cachePut` | function | Stores a value in the cache. |
| `cacheForget` | function | Removes a cached value, every value under a key array, or every value that matches a glob. |
| `cacheFlush` | function | Removes every cached value with a tag. |
| `withLock` | function | Runs a function while it holds a Redis lock. Throws `ConflictError` when a different caller holds the lock. |
| `CacheKey` | type | A cache key: a string, or an array of parts joined with `:`. |
| `CacheTtl` | type | How long a cached value lives. |
| `CacheOptions` | type | The options of `remember()` and `cachePut()`. |

## Security

Guide: [Security](./security.md).

| Name | Kind | Description |
|---|---|---|
| `clientIp` | function | Returns the address of the client that sent the request. |
| `csvSafe` | function | Formats a value as one CSV cell that a spreadsheet does not run as a formula. |
| `defineRateLimit` | function | Defines a shared rate limit, named after its file. |
| `rateLimit` | function | Adds a rate limit to a route handler or a procedure. |
| `rateLimiter` | function | Returns a shared rate limiter that counts attempts per key. |
| `requireSignature` | function | Throws `ForbiddenError` (HTTP 403) when the request URL, or a given path, is not a valid, unexpired signed URL. |
| `signedUrl` | function | Returns a copy of a path that expires, signed with the app secret. |
| `useSecrets` | function | Returns every value a rotatable secret accepts, the current one first. |
| `$rateLimits` | namespace | Holds each shared rate limit definition under its path: `$rateLimits.export`. Server only. |
| `RateLimit` | type | A shared rate limit from `defineRateLimit()`. |
| `RateLimitName` | type | The name of every shared limit, `login` included. |
| `RateLimitOptions` | type | The options of `rateLimit()`. |
| `Duration` | type | A length of time such as `{ minutes: 5 }`: a cache TTL, a rate limit window, a `signedUrl()` expiry, a job `timeout`, `backoff` or `delay`. |
| `RateLimitWindow` | type | How long a rate limit's sliding window lasts: a `Duration`. |

## User content

Guide: [Security: user content](./security.md#user-content).

| Name | Kind | Description |
|---|---|---|
| `sanitizeHtml` | function | Removes every tag, attribute and URL scheme that is not on a strict allowlist from an HTML string. |
| `SanitizedHtml` | type | An HTML string that went through `sanitizeHtml()`. |
| `richText` | schema | A Zod schema for an HTML field that users write. It checks the length, then sanitizes. |

## Logging

Guide: [Observability: logging](./observability.md#logging).

| Name | Kind | Description |
|---|---|---|
| `useLogger` | function | Returns the server logger. |

## Configuration

Guide: [Configuration](./index.md#configuration).

| Name | Kind | Description |
|---|---|---|
| `useNuxvelConfig` | function | Returns the runtime part of the `nuxvel` config block. |

## See also

- [Frontend](./frontend.md)
- [Validation](./validation.md)
- [Testing](./testing.md)
