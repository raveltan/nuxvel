# nuxvel documentation

nuxvel is a Nuxt module and a CLI that give a Nuxt app a backend: a database, a typed API, validation, auth, actions, queues and more. It is a thin layer over Drizzle, tRPC, Zod and Better Auth, and every Nuxt feature stays available.

## Getting started

### Installation

Create a new app with `create-nuxvel`:

```bash
npm create nuxvel@latest my-app
```

[Starting a new app](./create.md) shows what the command writes, the next steps it prints, and how to create an app from a local checkout.

To add nuxvel to an existing Nuxt app, add the module to `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
});
```

### Configuration

nuxvel reads its settings from environment variables. The app's `.env.example` lists the main ones. At boot, nuxvel checks the variables and stops with an error when one is missing or invalid. See [Env validation at boot](./security.md#env-validation-at-boot).

**Required**

| Variable | Runtime config key | Value |
|---|---|---|
| `NUXT_DATABASE_URL` | `databaseUrl` | Postgres connection that the app uses at runtime. See [Database](./database.md#configuration) |
| `NUXT_DATABASE_OWNER_URL` | | Postgres connection that owns the tables. Only migrations and the test setup use it. See [Database](./database.md#configuration) |
| `NUXT_AUTH_SECRET` | | Better Auth secret that signs sessions, at least 32 characters. See [Authentication](./auth.md#rotating-the-auth-secret) |

**Optional services**

| Variable | Runtime config key | Value |
|---|---|---|
| `NUXT_DATABASE_POOL_MAX` | `databasePoolMax` | Most Postgres connections of one server process, 10 by default. See [Database](./database.md#configuration) |
| `NUXT_REDIS_URL` | `redisUrl` | Redis connection for the queue, rate limits and `useRedis()`. Required in production. In other cases, the default is `redis://localhost:6379`. See [Redis](./redis.md#configuration) |
| `NUXT_REDIS_CACHE_URL` | `redisCacheUrl` | Separate Redis for the `cache` connection: cached values only. When it is not set, the cache uses `NUXT_REDIS_URL`. See [Redis](./redis.md#a-separate-redis-for-the-cache) |
| `NUXT_REDIS_PREFIX` | `redisPrefix` | Prefix of every Redis key and pub/sub channel of the app, so apps can share one Redis. Empty by default. See [Redis](./redis.md#key-prefix) |
| `NUXT_MAIL_URL` | `mailUrl` | SMTP server that `sendMail()` and the [auth mails](./auth.md#email-verification) deliver through. Required in production. See [Mail](./mail.md#configuration) |
| `NUXT_STORAGE_URL` | `storageUrl` | S3-compatible endpoint for `useS3()`, with the access key and secret as user and password. Required in production when the app defines an upload. See [Storage](./storage.md#configuration) |
| `NUXT_STORAGE_PUBLIC_URL` | `storagePublicUrl` | Address that browsers reach the storage on, for upload and read URLs. Defaults to `NUXT_STORAGE_URL`. See [Storage](./storage.md#configuration) |
| `NUXT_ERASURE_LOG_COMMAND` | `erasureLogCommand` | Command that `eraseUserData()` runs with the user's ID before it erases, to record the erasure outside the database. `nuxvel deploy` sets it on a VPS. See [Privacy](./privacy.md#the-erasure-log) |
| `NUXT_STORAGE_BUCKET` | `storageBucket` | Bucket that uploads go to. Required in production when the app defines an upload. See [Storage](./storage.md#configuration) |
| `NUXT_PUBLIC_SENTRY_DSN` | `public.sentryDsn` | DSN of a Bugsink or Sentry project for error reports. Empty turns error tracking off. See [Observability](./observability.md#configuration) |
| `NUXT_AUTH_<PROVIDER>_CLIENT_ID` | `auth.<provider>.clientId` | Client ID of the OAuth app of a provider in `nuxvel.auth.social`, for example `NUXT_AUTH_GITHUB_CLIENT_ID`. Required in production when the provider is on. See [Social login](./auth.md#social-login) |
| `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET` | `auth.<provider>.clientSecret` | Client secret of the same OAuth app. Required in production when the provider is on. See [Social login](./auth.md#social-login) |
| `NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION` | `auth.requireEmailVerification` | `true` refuses a password sign-in until the user confirms their email address. The default is `true` in a production build and `false` in development and test builds. See [Email verification](./auth.md#email-verification) |
| `NUXT_AUTH_CHECK_BREACHED_PASSWORDS` | `auth.checkBreachedPasswords` | `true` refuses a new password that is in a known data breach. The default is `true`, except in test builds. See [Password rules](./auth.md#password-rules) |
| `NUXT_AUTH_TURNSTILE_SECRET_KEY` | `auth.turnstileSecretKey` | Cloudflare Turnstile secret key. Once set, sign-up and password reset need a Turnstile token. See [Bot protection](./auth.md#bot-protection) |
| `NUXT_AUTH_BLOCK_DISPOSABLE_EMAILS` | `auth.blockDisposableEmails` | `true` refuses sign-up and email change with a disposable email address. The default comes from `nuxvel.auth.blockDisposableEmails`. See [Disposable email addresses](./auth.md#disposable-email-addresses) |
| `NUXT_STRIPE_SECRET_KEY` | `stripeSecretKey` | Stripe secret or restricted key of `nuxvel.billing`. Required in production with billing on. `nuxt dev` and test builds refuse a live key. See [Billing](./billing.md#configuration) |
| `NUXT_STRIPE_TEST_KEYS_ONLY` | `stripeTestKeysOnly` | `true` refuses a live Stripe key whatever `NODE_ENV` says. The default is `true` in `nuxt dev` and test builds and `false` in a production build. See [Billing](./billing.md#configuration) |
| `NUXT_STRIPE_WEBHOOK_SECRET` | | Signing secret for a webhook with `verify: "stripe"`, and for the Stripe webhook of `nuxvel.billing`, where it is required in production. See [Webhooks](./webhooks.md#verifying-the-signature) and [Billing](./billing.md#configuration) |
| `NUXT_GITHUB_WEBHOOK_SECRET` | | Signing secret for a webhook with `verify: "github"`. See [Webhooks](./webhooks.md#verifying-the-signature) |
| `NUXT_RESEND_WEBHOOK_SECRET` | | Signing secret for `defineMailWebhook("resend")` or `verify: "resend"`. See [Bounce webhooks](./mail.md#bounce-webhooks) |
| `NUXT_MAILGUN_WEBHOOK_SIGNING_KEY` | | Webhook signing key for `defineMailWebhook("mailgun")` or `verify: "mailgun"`. See [Bounce webhooks](./mail.md#bounce-webhooks) |
| `NUXT_AUDIT_CHAIN_SECRET` | | Key of the audit hash chain, at least 32 characters. Required in production. Never change it. See [Audit log](./audit.md#the-chain-secret) |
| `NUXT_OG_IMAGE_SECRET` | | Signing secret of the Open Graph image URLs. Required in production with `seo.ogImage`. `nuxvel app:create` writes a random one on a VPS. See [SEO](./seo.md#the-signing-secret) |
| `NUXT_SITE_URL` | `siteUrl` | Public origin of the app. The auth mail links, canonical links and the sitemap start with it. It overrides `nuxvel.seo.siteUrl`. Required in production. See [Authentication](./auth.md#social-login) and [SEO](./seo.md#site-defaults) |
| `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` | `public.pushVapidPublicKey` | Public VAPID key that devices subscribe to push notifications with. `nuxvel push:keys` writes it. See [Progressive web app](./pwa.md#vapid-keys) |
| `NUXT_PUSH_VAPID_PRIVATE_KEY` | `pushVapidPrivateKey` | Private VAPID key that signs push notifications. `nuxvel push:keys` writes it. See [Progressive web app](./pwa.md#vapid-keys) |
| `NUXT_PUSH_VAPID_SUBJECT` | `pushVapidSubject` | A `mailto:` or `https:` URL where the push services can contact you. See [Progressive web app](./pwa.md#vapid-keys) |
| `NUXT_MAILPIT_URL` | `mailpitUrl` | Dev server only. Mailpit address that the DevTools mail panel reads. The default is `http://localhost:8025`. See [Mail](./mail.md#configuration) |

**Runtime tuning**

| Variable | Value |
|---|---|
| `NUXT_LOG_LEVEL` | `silent`, `fatal`, `error`, `warn`, `info`, `debug` or `trace`. The default is `info`. See [Observability](./observability.md#configuration) |
| `NUXT_LOG_FORMAT` | `pretty` or `json`. The default is `pretty` in `nuxt dev` and `json` in all other cases. See [Observability](./observability.md#configuration) |
| `NUXT_NUXVEL_SECURITY_TRUST_PROXY` | `true`, a number of proxies, or `loopback`. Overrides `nuxvel.security.trustProxy` at runtime. See [Security](./security.md#client-ip-behind-a-proxy) |
| `NUXT_NUXVEL_MAIL_FROM` | Sender address of every mail. Overrides `nuxvel.mail.from`. See [Mail](./mail.md#configuration) |
| `NUXT_NUXVEL_REALTIME_MAX_CONNECTIONS` | Realtime connections that one user or one guest IP address can keep open. Overrides `nuxvel.realtime.maxConnections`. The default is 20. See [Realtime](./realtime.md#limits) |
| `NUXT_NUXVEL_EXPERIMENTS_REQUIRE_CONSENT` | `true` or `false`. Overrides `nuxvel.experiments.requireConsent` at runtime. See [Feature flags](./flags.md#consent) |
| `NUXT_NUXVEL_HEALTH_MIN_FREE_DISK_PERCENT` | Free disk space, in percent, under which `/api/health/ready` reports `disk: "low"`. Overrides `nuxvel.health.minFreeDiskPercent`. The default is 15. See [Observability](./observability.md#health-endpoints) |
| `NUXVEL_ROLE` | `worker` runs the queue worker in this server. See [Queues](./queues.md#running-jobs) |
| `NUXVEL_WORKER_CONCURRENCY` | Number of jobs of each queue that the worker runs at the same time. The default is 5. See [Queues](./queues.md#running-jobs) |
| `NUXVEL_WORKER_QUEUES` | Comma-separated queues that the worker runs. When it is not set, the worker runs every queue. See [Queues](./queues.md#running-jobs) |
| `NUXVEL_REALTIME_HEARTBEAT_SECONDS` | Seconds between the `ping` events of a realtime connection. It is also the presence heartbeat. The default is 15. See [Realtime](./realtime.md#presence) |
| `NUXVEL_REALTIME_DRAIN_SECONDS` | Seconds within which a server under pm2 closes its realtime connections on `SIGUSR2`, at random moments, so the clients reconnect to a new release. The default is 30. See [Realtime](./realtime.md#deploys) |
| `NITRO_SHUTDOWN_TIMEOUT` | Milliseconds that Nitro waits at shutdown before the process stops. The default is 30000. See [Queues](./queues.md#shutdown) |
| `<name>_PREVIOUS`, `<name>_PREVIOUS_EXPIRES_AT` | Previous value of a rotated secret and the end of its grace period, for example `NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT`. `nuxvel key:rotate` writes them. See [Security](./security.md#rotating-secrets) |
| `NUXVEL_DEVTOOLS` | `1` records the work of `nuxvel queue:work`, `nuxvel task:run` and `nuxvel tinker` for the DevTools tab. Development only. See [DevTools](./devtools.md#jobs-and-commands) |

**Build-time**

| Variable | Value |
|---|---|
| `NUXVEL_GIT_COMMIT` | Commit that the build manifest records. `nuxvel build` gives it to the Docker build. See [Building for production](./build.md#build-manifest) |
| `NUXVEL_BUILD_SOURCE` | `ci` or `local`, the build source in the manifest. `nuxvel build` gives it to the Docker build. See [Building for production](./build.md#build-manifest) |
| `CI` | When set, the build manifest records `ci` as the build source. See [Building for production](./build.md#build-manifest) |

The runtime config keys are private runtime config, except `public.sentryDsn` and `public.pushVapidPublicKey`. The `NUXT_*` variables override them at runtime, like any Nuxt runtime config. `runtimeConfig` in `nuxt.config.ts` can also set them.

These `NUXT_*` variables are plain environment variables with no runtime config key: `NUXT_AUTH_SECRET`, `NUXT_AUDIT_CHAIN_SECRET`, `NUXT_OG_IMAGE_SECRET`, `NUXT_DATABASE_OWNER_URL`, `NUXT_LOG_LEVEL`, `NUXT_LOG_FORMAT` and the four webhook signing secrets. `runtimeConfig` cannot set them. Set them in the environment or in `.env`.

The prefix tells you who reads a variable. The app server reads a `NUXT_*` variable. A `NUXVEL_*` variable selects a process mode, such as `NUXVEL_ROLE`, or configures tooling, such as `NUXVEL_GIT_COMMIT`.

Settings follow one rule. The address and credentials of a service, such as `databaseUrl` or `mailUrl`, are top-level runtime config that a `NUXT_*` variable sets. How nuxvel behaves, such as the sender of a mail or the sign-in path, is a module option under the `nuxvel` key. One service can thus have settings in both places: `NUXT_MAIL_URL` sets the SMTP server, and `nuxvel.mail.from` sets the sender.

Module options go under the `nuxvel` key. The options are `mail`, `audit`, `experiments`, `database`, `queue`, `realtime`, `security`, `health`, `billing`, `rendering`, `auth`, `api`, `ui`, `perf`, `seo` and `pwa`. Each guide describes its option:

```ts
export default defineNuxtConfig({
  modules: ["@nuxvel/nuxt"],
  nuxvel: {
    mail: { from: "My app <hello@example.com>" },
    audit: { retentionMonths: 24 },
    experiments: { requireConsent: true },
    database: { purgeTrashedAfter: "30 days" },
    queue: { outboxRetention: "7 days" },
    realtime: { maxConnections: 20 },
    security: { trustProxy: 1 },
    health: { minFreeDiskPercent: 10 },
    billing: true,
    auth: { signInPath: "/sign-in", social: { github: true } },
    api: { restPrefix: "/api/v1", openapi: { title: "Blog API", version: "1.0.0" } },
    rendering: { "/blog/**": "cached", "/dashboard/**": "private" },
    perf: { bundle: { maxInitialKb: 200 } },
    seo: { siteName: "My app", siteUrl: "https://example.com" },
  },
});
```

`mail.from` is the sender address of every mail. `sendMail()` throws while it is not set. See [Mail](./mail.md#configuration).

`audit.retentionMonths` is the number of months of audit rows to keep. When it is not set, the log keeps every row. See [Audit log: partitions and retention](./audit.md#partitions-and-retention).

`rendering` gives a rendering preset to each route pattern: `cached`, `private` or `client`. See [Rendering](./rendering.md#rendering-presets).

`ui` installs Nuxt UI. The default is `true`. Set it to `false` to use your own markup. See [Frontend: opting out](./frontend.md#opting-out).

`perf.bundle.maxInitialKb` is the most gzipped JavaScript and CSS, in KB, that the first load of one page can need. A page over it fails the build. See [Building for production: bundle budget](./build.md#bundle-budget).

`api.restPrefix` is the path that REST endpoints start with. `api.openapi` turns on the OpenAPI document, and `api.docs` serves its reference page in production. See [REST and OpenAPI](./openapi.md#configuration). `api.invalidateFallback: false` stops a mutation from invalidating the queries of its router namespace. See [Frontend: invalidation](./frontend.md#invalidation).

`seo` sets the title template, canonical links, default Open Graph tags, `robots.txt` and `sitemap.xml`. See [SEO](./seo.md).

`auth.signInPath` is the page that the `auth` middleware sends signed-out visitors to. `auth.social` turns on sign-in with social providers. See [Auth](./auth.md#social-login). `auth.blockDisposableEmails` refuses sign-up with a disposable email address. See [Disposable email addresses](./auth.md#disposable-email-addresses).

`database.purgeTrashedAfter` deletes soft-deleted rows permanently after that time. See [Soft deletes: purging trashed rows](./soft-deletes.md#purging-trashed-rows).

`database.unindexedForeignKeys` lists the foreign keys that `nuxvel db:check` accepts without an index, each with a reason. See [Database: foreign key indexes](./database.md#foreign-key-indexes).

`pwa` makes the app an installable progressive web app with an offline page. It takes `name`, `shortName`, `themeColor` and `icons`. See [Progressive web app](./pwa.md#installing-the-app).

`realtime.maxConnections` is the number of realtime connections that one user, or one guest IP address, can keep open. See [Realtime: limits](./realtime.md#limits).

`security.trustProxy` reads the client IP from the `X-Forwarded-For` header. Set it when the app runs behind a proxy. See [Security: client IP behind a proxy](./security.md#client-ip-behind-a-proxy).

`experiments.requireConsent` gives a visitor without consent the control of every experiment and records no exposure. See [Feature flags: consent](./flags.md#consent).

`health.minFreeDiskPercent` sets when `/api/health/ready` reports a low disk. See [Observability: health endpoints](./observability.md#health-endpoints).

`billing` turns on payments with Stripe. See [Billing](./billing.md).

`queue.outboxRetention` is how long an `outbox` row stays after it reached the queue. The default is `"7 days"`. See [Queues: pruning the outbox](./queues.md#pruning-the-outbox).

On the server, `useNuxvelConfig()` returns the runtime part of this block, as merged into runtime config: `mail`, `audit`, `experiments`, `database` without `database.unindexedForeignKeys`, `queue`, `realtime`, `security`, `health`, `billing`, `api` without `api.docs`, and `siteName` from `seo.siteName`. Its type is `NuxvelRuntimeConfig` from `@nuxvel/nuxt`. The build-time options `ui`, `perf`, `rendering`, `auth`, `seo` and `pwa` are not in it:

```ts
const from = useNuxvelConfig().mail?.from;
```

### Directory structure

You never register a definition. Put a file in the correct folder and nuxvel discovers it:

| Folder | Contents |
|---|---|
| `server/database/schema/**` | Drizzle tables, exported from `#nuxvel/schema` |
| `server/database/backfills/**` | One backfill per file |
| `shared/schemas/**` | Zod schemas, auto-imported in `app/` and `server/` |
| `server/trpc/routers/**` | tRPC routers. The file or folder name is the namespace |
| `server/actions/**` | One action per file |
| `server/events/**` | One domain event per file |
| `server/listeners/**` | One event listener per file |
| `server/jobs/**` | One background job per file |
| `server/schedules/**` | One scheduled task per file |
| `server/rate-limits/**` | One shared rate limit per file |
| `server/tasks/**` | One on-demand task per file |
| `server/mail/**` | One mail per file, with its Vue templates next to it |
| `server/notifications/**` | One notification per file |
| `server/uploads/**` | One upload per file |
| `server/webhooks/**` | One incoming webhook per file |
| `server/products/**` | One product per file. See [Billing](./billing.md#products) |
| `server/channels/**` | One realtime channel per file |
| `server/policies/**` | One policy per table |
| `server/errors/**` | One error classifier per file. See [API: error classifiers](./api.md#error-classifiers) |
| `server/factories/**` | One test factory per table. `nuxvel tinker` has each one in scope. See [Testing: factories](./testing.md#factories) |
| `server/seeders/**` | One database seeder per file |
| `server/flags/**` | One feature flag or experiment per file |
| `server/privacy/**` | One personal-data declaration per file |

`server/` is Nuxt's `serverDir`. nuxvel scans every [layer](https://nuxt.com/docs/guide/going-further/layers) that the app extends in the same way. A layer can thus ship jobs, routers, policies and the other definitions. In `nuxt dev`, when you add or remove a file in one of these folders, the server rebuilds without a restart.

Every server helper is auto-imported. There are no barrel files. [Server auto-imports](./auto-imports.md) lists every name available in `server/`. [Conventions](#conventions) tells how a file's path gives a definition its name.

## Tutorials

[Tutorial: your first nuxvel app](./tutorials/first-app.md) is the tutorial to read first. It builds Gather, a small app for event invitations, in about one hour. It covers `create-nuxvel`, a resource with its pages, auth and a policy, an action with typed failures, a form, a data table, a mail and tests in the three layers.

[Tutorial: an online course platform](./tutorials/course-platform.md) is the capstone. Read it after the first app. It builds a course platform with the structure of a larger product. It covers domain folders, a module as a layer, three roles with policies, tenant-safe ownership, uploads, actions, domain events and listeners, a mail from the outbox, notifications, search and pagination, a feature flag, an API key with the OpenAPI document and an outbound webhook. Each chapter adds tests in the three layers.

[Tutorial: testing in depth](./tutorials/testing-in-depth.md) builds one feature test-first, through the functional, component and end-to-end layers.

[Tutorial: build a multi-tenant invoicing app](./tutorials/invoices.md) builds a small SaaS app with teams, team roles, tenant isolation, email verification, two-factor sign-in, social login, admin tools, the audit log, rate limits and API keys.

[Tutorial: build a product catalogue, component by component](./tutorials/component-driven-ui.md) builds an admin UI in Storybook first, with the nuxvel UI components, `useActionForm()`, the server mocks and a component test for each state.

[Tutorial: a garden journal with its own look](./tutorials/theming.md) gives an app its own design. It covers brand colours and design tokens, fonts, a custom icon set, the `ui` config of a component, design-system components with typed props, dark mode with a toggle, the nuxvel components with the app's design and the replacement of one, the strict CSP on a client-only page, and the contrast check of each story in dark mode.

[Tutorial: build a live team chat](./tutorials/realtime.md) builds a chat with rooms that only their members read. It covers channels with authorization, presence, a typing indicator, broadcasts after the commit, live queries, optimistic sending and the reconnect.

[Tutorial: build a public recipe site](./tutorials/recipe-site.md) builds a public site with a few author pages. It covers `useSeo()`, canonical links, structured data, Open Graph images, the sitemap and `robots.txt`, cached and private pages, the cache helpers, an installable app that works offline, web push, and the site in English and Chinese.

[Tutorial: build event-driven orders](./tutorials/orders.md) builds a shop where one order starts a stock change, a sale row, a mail and an invoice. It covers domain events, sync and queued listeners, `dispatchAfterCommit()` and the outbox, job retries and `unique`, listeners that are safe to run two times, and a backfill between an expand and a contract migration.

[Tutorial: build a status page](./tutorials/status-page.md) builds a public status page that an uptime monitor and the team keep up to date. It covers an inbound webhook that runs one time for each event, a job that mails each subscriber after the commit, an MJML mail template, notifications to the team, a feature flag as a switch, the cache with `invalidates`, pagination and a schedule.

[Tutorial: ship and run an app](./tutorials/ship-and-run.md) takes a small app from the first commit to a VPS, and runs it there. It covers domain folders, a module as a layer, `nuxvel test:arch`, the Docker image and the release archive, `make:ci`, `server:setup`, blue-green deploys with an expand and a contract migration, backups, restores, a restore rehearsal and the erasure log, `tinker` on the server, monitoring, error tracking and maintenance mode.

## The basics

- [Database](./database.md): `useDb()`, `timestamps()`, `transaction()`, `onCommit()`, `findOrFail()`, `paginate()`, `paginated()`, `defineSeeder()`
- [Full-text search](./search.md): `searchable()`, `search()`, `searchRank()`, `highlight()`
- [Soft deletes](./soft-deletes.md): `softDeletes()`, `softDelete()`, `restore()`, `notTrashed()`, `purgeTrashed()`
- [Validation](./validation.md): shared Zod schemas and the error shape
- [API](./api.md): tRPC routers, procedures, server and client callers, cached queries
- [REST and OpenAPI](./openapi.md): procedures as REST endpoints under `/api/v1`, the OpenAPI document, the API reference page, API keys
- [Actions](./actions.md): `defineAction()`, actors, typed failures
- [Frontend](./frontend.md): Nuxt UI, `useActionForm()`, `flash()`, `useConfirm()`, `<DataTable>`, `<UploadField>`, `<SearchInput>`, `<QueryState>`, `useLiveQuery()`, presence, layouts, accessibility lint
- [Rendering](./rendering.md): the `cached`, `private` and `client` presets, `<DateTime>`, `useTimezone()`
- [Internationalization](./i18n.md): `nuxt-i18n-micro`, the `locales/` folder, `$t`, `<i18n-link>`, `<i18n-switcher>`, keeping only English
- [SEO](./seo.md): `useSeo()`, the title template, canonical links, Open Graph tags and images, `robots.txt`, `sitemap.xml`

## Security

- [Authentication](./auth.md): sign-up, sign-in, sessions, `useAuth()`, protected routes and procedures
- [Authorization](./authorization.md): policies, `can()`, `authorize()`
- [Security](./security.md): strict headers, CSP, origin checks on mutations, signed URLs, rate limits

## Digging deeper

- [Domain events](./events.md): `defineEvent()`, `defineListener()`, `emit()`
- [Queues](./queues.md): `defineJob()`, `dispatchAfterCommit()`, `defineSchedule()`
- [Mail](./mail.md): `defineMail()`, `sendMail()`, `suppressMail()`, Mailpit in development
- [Notifications](./notifications.md): `defineNotification()`, `notify()`, the database, mail and push channels, `<NotificationBell>`
- [Storage](./storage.md): `useS3()`, `defineUpload()`, presigned uploads, SeaweedFS in development
- [Realtime](./realtime.md): `defineChannel()`, `broadcast()`, `broadcastAfterCommit()`, `useChannel()`, `useJobChannel()`, server-sent events
- [Feature flags](./flags.md): `defineFlag()`, `defineExperiment()`, `flag()`, `useFlag()`, targeting, `track()`
- [Webhooks](./webhooks.md): `defineWebhook()`, signature checks, repeated deliveries, `sendWebhook()`
- [Billing](./billing.md): Stripe subscriptions and one-time payments, `useStripe()`
- [Backfills](./backfills.md): `defineBackfill()`, `runBackfill()`, resumable data migrations
- [Redis](./redis.md): `useRedis()`, one connection per purpose
- [Cache](./cache.md): `remember()`, `cacheForget()`, `cacheFlush()`, tags, `withLock()`
- [Audit log](./audit.md): `audit()`, `audited()`, redaction, hash chain, retention
- [Privacy](./privacy.md): `defineUserData()`, `nuxvel user:export`, `nuxvel user:erase`
- [Storybook](./storybook.md): `.storybook/`, stories next to their components, play functions, component tests, `npm run storybook`, `storybook build`
- [Progressive web app](./pwa.md): the web app manifest, the service worker, the offline page, `<PwaInstallPrompt>`, `usePush()`, `<PushToggle>`, `sendPush()`

## Testing

- [Testing](./testing.md): the three layers (functional, component and end-to-end tests) and where a check goes, the scripts `test`, `test:functional`, `test:ui`, `test:e2e` and `test:arch`, factories, `actingAs()`, `signIn()`, `guest()`, fakes, `travelTo()`, `fakeFetch()`, `visit()`, locator helpers, `expect`, `trpcSpy()`, `it.for` and `nuxvel test --changes-only`

## Operations

- [CLI](./cli.md): every `nuxvel` command, from `nuxvel dev` to `nuxvel audit:verify`
- [DevTools](./devtools.md): the dev-only nuxvel tab with jobs, audit entries, procedures and the queue board
- [Observability](./observability.md): the server logger, request logs, health endpoints, error tracking
- [Maintenance mode](./maintenance.md): `nuxvel down` and `nuxvel up`, the bypass secret, the paused queue
- [Building for production](./build.md): `nuxvel build`, Docker images, archives per platform, `build:verify`
- [Deploying to a VPS](./deploy.md): `nuxvel.deploy.ts` and its credentials, `server:setup` and `app:create`, the Caddy site, blue-green deploys from your machine or GitHub Actions, releases, contract migrations and rollbacks, the server `.env`, logs, status and `tinker`, the monitor with its alerts and metrics, security updates, backups, restores and rehearsals, credential rotation, destroying an app

## Reference

- [Server auto-imports](./auto-imports.md): every name auto-imported in `server/`
- [Modules](./modules.md): parts of a large app as layers in `layers/<name>/`

## Conventions

### Names come from paths

A definition has no `name` option. Its path under its folder is its name. The path segments are joined with `.`, and the kind suffix of the file name is removed:

| File | Name |
|---|---|
| `server/jobs/post/notify-subscribers.job.ts` | job `"post.notify-subscribers"` |
| `server/events/post/published.event.ts` | event `"post.published"` |
| `server/listeners/post/notify-followers.listener.ts` | listener `"post.notify-followers"` |
| `server/flags/new-checkout.flag.ts` | flag `"new-checkout"` |
| `server/webhooks/billing/stripe.webhook.ts` | webhook `"billing.stripe"`, at `POST /api/webhooks/billing.stripe` |
| `server/actions/posts/create-post.action.ts` | action `"posts.create-post"` |
| `server/seeders/blog/tags.seeder.ts` | seeder `"blog.tags"` |

A file name ends with the kind of its folder, for example `.job.ts` in `server/jobs/` or `.flag.ts` and `.experiment.ts` in `server/flags/`. The `make:*` generators write this suffix. The name does not include it. A file without the suffix also works: `server/jobs/post/notify-subscribers.ts` is also the job `"post.notify-subscribers"`. `nuxvel test:arch` warns about such a file. If `notify.ts` and `notify.job.ts` are in one folder, the build fails.

A file exports its definition as a named export whose name ends with the kind: `export const postNotifySubscribersJob = defineJob(...)`. A default export also works. In `server/flags/`, the name ends with `Flag` or `Experiment`. A policy name ends with `Policy`, and a `defineUserData()` name ends with `UserData`. If a file exports two different definitions in this way, the server does not start.

A name holds only `a-z`, `0-9`, `.`, `_` and `-`. For any other character, the build fails and suggests a name. For example, `a b.ts` and `sendMail.ts` fail.

Discovery skips `*.test.ts`, `*.spec.ts` and `*.d.ts` files. `nuxvel events` and `nuxvel test:arch` also skip them. Tests can thus sit next to the code that they cover.

This rule names actions, events, listeners, jobs, schedules, mails, notifications, uploads, webhooks, channels, backfills, seeders, rate limits, flags and experiments. The generated `#nuxvel/*` types hold each name as a literal. Every API that takes a name accepts only names that exist. Examples are `dispatchAfterCommit()`, `sendMail()`, `useFlag()`, `useChannel()`, `$fetch("/api/uploads/<name>")` and the test fixtures.

tRPC routers also follow their path. The path is camel-cased into the namespace that you call: `health-checks.ts` is `trpc.healthChecks`. The `.router.ts` suffix is not part of the namespace: `task.router.ts` is `trpc.task`. Policies and `defineUserData()` are keyed by their table and have no name.

A definition gets its name when the app loads its folder. Read `.name` while the app runs, not while a module loads. Before that, reading it throws "has no name yet". A spread, `JSON.stringify` or a printed definition leaves the name out.

A file in the app hides a file with the same name in a layer, as Nuxt layer overrides do. tRPC routers follow the same rule by namespace. An app router on `trpc.posts` replaces the layer's `posts` router and every layer router under it.

The build fails in these cases:

- Two files in one folder give the same name, such as `post.notify.ts` next to `post/notify.ts`.
- A file has the name of a nuxvel definition: the `nuxvel.mail` job, the `nuxvel.notification` job, the `nuxvel.webhook` job, the `nuxvel.push` job when `nuxvel.pwa` is set, the `nuxvel.billing.process-event` job, the `stripe` webhook, the `nuxvel.billing.reconcile` schedule and the `nuxvel.billing.subscription-changed`, `nuxvel.billing.paid`, `nuxvel.billing.refunded` and `nuxvel.billing.disputed` events when `nuxvel.billing` is on, the `nuxvel.auth.verify-email`, `nuxvel.auth.reset-password`, `nuxvel.auth.security-notice` and `nuxvel.auth.existing-account` mails, the `flags` and `maintenance` channels, the `nuxvel.auth.reencrypt-two-factor` schedule, the `nuxvel.prune-outbox` schedule, or the `nuxvel.purge-trashed` schedule when it is on.

### Renaming a definition

When you move a file, its definition gets a new name. Data that is stored under the old name then matches nothing. To keep it, leave the old file in place as an alias:

```ts
// server/jobs/post-notify.job.ts, after the job moved to server/jobs/post/notify.job.ts
import { postNotifyJob } from "./post/notify.job";

export default renamed(postNotifyJob);
```

`renamed()` is auto-imported. The old name is not in `JobName`, `FlagName` or the other name types, so new code can only use the new name. The alias keeps the old name working for data that exists:

| Kind | What the alias keeps |
|---|---|
| job, listener | Runs queued jobs and outbox rows that still have the old name (`listener:<old>` for a listener). Delete the alias when `nuxvel queue:versions` shows none |
| webhook | Answers at the old URL, `POST /api/webhooks/<old>`, until the provider uses the new one |
| schedule | Keeps the BullMQ scheduler under the old name, so the schedule is not registered twice |
| flag, experiment | Keeps targeting, experiment state, exposures and conversions under the old name. It buckets users by the old name, so no user changes variant |
| backfill | Continues from the cursor stored under the old name |
| product | Finds the billing rows stored under the old name |

A definition takes one alias.

Mails, notifications, uploads, channels, events, actions and rate limits need no alias. Nothing is looked up by their name later. A `notifications` row keeps the name that it was sent with, but nothing reads a row by that name. A `renamed()` in one of their folders stops the server from starting. An audit row's `action` is the string that you give to `audit()`, not a file name.

`nuxvel doctor` shows data that is still stored under a name that no definition has, for example jobs left in the queue after you deleted an alias. See [CLI](./cli.md#nuxvel-doctor).
