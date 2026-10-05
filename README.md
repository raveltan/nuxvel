# nuxvel

nuxvel is a Nuxt module and a CLI that give a Nuxt app a backend: a Postgres database, a typed tRPC API, Zod validation, email and password auth, actions, queues, mail, storage and realtime. It is a thin layer over Drizzle, tRPC, Zod and Better Auth, and every Nuxt feature stays available. You put files in known folders, and nuxvel discovers them.

## Quick start

You need Node.js 24 and a running Docker. Create the app, then start it:

```bash
npm create nuxvel@latest my-app
cd my-app && npm install && ./nv services up && ./nv db:migrate && ./nv db:seed
npm run dev
```

Open https://my-app.localhost and sign in as `demo@example.com` with the password `demo-password`, or sign up.

## What you get

- [Database](./docs/database.md): Drizzle tables, migrations, transactions, pagination, seeders
- [Full-text search](./docs/search.md): Postgres full-text search on a table
- [Soft deletes](./docs/soft-deletes.md): trashed rows that you can restore or purge
- [Validation](./docs/validation.md): Zod schemas shared by the app and the server
- [API](./docs/api.md): tRPC routers with typed server and client callers
- [REST and OpenAPI](./docs/openapi.md): procedures as REST endpoints, an OpenAPI document and API keys
- [Actions](./docs/actions.md): one write per file, with actors and typed failures
- [Frontend](./docs/frontend.md): Nuxt UI, forms, flash messages, confirm dialogs, data tables, uploads and live queries
- [Rendering](./docs/rendering.md): cached, private and client-only pages
- [SEO](./docs/seo.md): title template, Open Graph tags, robots.txt and sitemap
- [Internationalization](./docs/i18n.md): English and Chinese in the starter, `$t` in pages and mail, a locale switcher, a sitemap and `hreflang` links for each locale, and validation messages in the locale of the request
- [Authentication](./docs/auth.md): email and password sign-up, sessions
- [Authorization](./docs/authorization.md): one policy per table
- [Security](./docs/security.md): headers, CSP, origin checks, signed URLs, rate limits
- [Domain events](./docs/events.md): events and queued listeners
- [Queues](./docs/queues.md): background jobs and schedules on BullMQ
- [Mail](./docs/mail.md): Vue mail templates, sent from the queue
- [Notifications](./docs/notifications.md): messages to a user in the database and by mail, with a live bell
- [Storage](./docs/storage.md): S3-compatible storage and presigned uploads
- [Realtime](./docs/realtime.md): channels and presence over server-sent events
- [Feature flags](./docs/flags.md): flags, targeting and experiments
- [Webhooks](./docs/webhooks.md): incoming webhooks with signature checks, and signed outbound webhooks
- [Billing](./docs/billing.md): Stripe subscriptions and one-time payments, opt-in with `nuxvel.billing`
- [Cache](./docs/cache.md): cached values in Redis, with tags, and locks
- [Audit log](./docs/audit.md): a hash-chained log with redaction and retention
- [Privacy](./docs/privacy.md): export and erasure of a user's data
- [Progressive web app](./docs/pwa.md): an installable app with an offline page and push notifications
- [Testing](./docs/testing.md): three layers of tests (functional tests in parallel against a real Postgres, component tests as Storybook stories, and end-to-end tests with `visit()`), factories with Faker data, fakes, a test clock, a smoke test, and `nuxvel test --changes-only` to run only the functional tests that your changes affect. In the starter, `npm test` runs `npm run test:functional` and `npm run test:ui`. `npm run test:e2e` runs the end-to-end tests, and `npm run test:arch` checks the architecture rules
- [Storybook](./docs/storybook.md): each component alone, with the stories of the nuxvel components and mocks of tRPC and the session
- [CLI](./docs/cli.md): generators that take fields (`nuxvel make:resource post title body:text --ui`), migrations, seeding, `nuxvel tinker` and the dev server with a summary of its services
- [DevTools](./docs/devtools.md): jobs, audit entries, procedures and the queue in Nuxt DevTools
- [Observability](./docs/observability.md): structured logs, health endpoints and error tracking
- [Maintenance mode](./docs/maintenance.md): `nuxvel down` with a banner and a bypass secret
- [Building for production](./docs/build.md): Docker images, archives and a bundle budget
- [Deploying to a VPS](./docs/deploy.md): server setup, blue-green deploys, backups, restores and monitoring

## Documentation

The [documentation index](./docs/index.md) starts with installation, configuration and the directory structure. Start with the [Tutorial: your first nuxvel app](./docs/tutorials/first-app.md). It builds a small app from start to finish. The [Tutorial: an online course platform](./docs/tutorials/course-platform.md) then uses many parts of nuxvel together in a larger app. The [other tutorials](./docs/index.md#tutorials) each go deep into one part, such as testing, realtime or deployment.

- **The basics:** [Database](./docs/database.md), [Full-text search](./docs/search.md), [Soft deletes](./docs/soft-deletes.md), [Validation](./docs/validation.md), [API](./docs/api.md), [REST and OpenAPI](./docs/openapi.md), [Actions](./docs/actions.md), [Frontend](./docs/frontend.md), [Rendering](./docs/rendering.md), [SEO](./docs/seo.md), [Internationalization](./docs/i18n.md)
- **Security:** [Authentication](./docs/auth.md), [Authorization](./docs/authorization.md), [Security](./docs/security.md)
- **Digging deeper:** [Domain events](./docs/events.md), [Queues](./docs/queues.md), [Mail](./docs/mail.md), [Notifications](./docs/notifications.md), [Storage](./docs/storage.md), [Realtime](./docs/realtime.md), [Feature flags](./docs/flags.md), [Webhooks](./docs/webhooks.md), [Billing](./docs/billing.md), [Backfills](./docs/backfills.md), [Redis](./docs/redis.md), [Cache](./docs/cache.md), [Audit log](./docs/audit.md), [Privacy](./docs/privacy.md), [Progressive web app](./docs/pwa.md)
- **Testing:** [Testing](./docs/testing.md), [Storybook](./docs/storybook.md)
- **Operations:** [CLI](./docs/cli.md), [DevTools](./docs/devtools.md), [Observability](./docs/observability.md), [Maintenance mode](./docs/maintenance.md), [Building for production](./docs/build.md), [Deploying to a VPS](./docs/deploy.md)
- **Reference:** [Server auto-imports](./docs/auto-imports.md), [Conventions](./docs/index.md#conventions)

## Packages

| Package | Contents |
|---|---|
| `@nuxvel/nuxt` | The Nuxt module |
| `@nuxvel/cli` | The `nuxvel` binary |
| `create-nuxvel` | The project scaffolder, `npm create nuxvel` |

## Security

Report a vulnerability in private. See [SECURITY.md](./SECURITY.md).

## Development (this repo)

The repo uses npm workspaces: `packages/*` and `playground/`. It needs Node.js 26 (`.nvmrc`). The playground is a real Nuxt app that the functional tests use.

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run test:release
npm run deps:upgrade
```

- `npm run dev` starts the services in `docker-compose.yml` (Postgres, Redis, Mailpit, SeaweedFS, Bugsink). Then it applies the pending migrations of the playground and starts the playground dev server with the queue worker inside it.
- `npm test` starts the services in `docker-compose.test.yml` (Postgres and SeaweedFS on tmpfs, Redis, Mailpit) itself. Run it before every commit.
- `npm run test:release` also builds the Docker image, checks the `create-nuxvel` install, and runs the VPS check against an Ubuntu container. It is too slow for every commit. `npm run test:deploy` runs the VPS check alone.
- `npm run deps:upgrade` updates the dependencies to the newest versions that their ranges in `package.json` allow. Then it runs the typecheck and `npm test`. Commit the new `package-lock.json` only when all of them pass.
- `.github/dependabot.yml` opens a weekly pull request for the root directory: one for minor and patch updates, one for major updates. `.github/workflows/dependencies.yml` runs the same checks on each pull request that changes a `package.json` or `package-lock.json`. Neither needs a secret.

Every feature in the documentation works, deployment to a VPS included. See [Deploying to a VPS](docs/deploy.md). One planned part is not built yet: the `nuxvel/deploy-action` repository is not published. The workflow that `nuxvel make:ci` writes does not use it. That workflow runs the `nuxvel` CLI itself.

## License

[MIT](./LICENSE)
