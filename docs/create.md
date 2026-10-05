# Starting a new app

## Introduction

`create-nuxvel` creates a new Nuxt app with nuxvel installed. The app has the tables nuxvel needs, their migrations, dev services in Docker, sign-up and sign-in pages, and a passing test. Use it to start every new nuxvel app.

## Requirements

- Node.js 24. `nuxt-security` and `@nuxvel/cli` need Node 24 or later. On an older version, npm prints an `EBADENGINE` warning.
- Docker, running. The app runs Postgres, Redis, Mailpit and SeaweedFS from its `docker-compose.yml`.

## Creating the app

```bash
npm create nuxvel@latest my-app
```

The command writes the app into `my-app` and prints the next steps:

```
cd my-app
npm install
./nv services up
./nv test
./nv db:migrate
./nv db:seed
npm run dev
then open https://my-app.localhost
README.md shows what to build next
```

`create-nuxvel` only writes files. It does not install dependencies.

Run `npm create nuxvel -- --help` to print the options:

| Option | Effect |
|---|---|
| `--local` | Depend on the nuxvel checkout that `create-nuxvel` runs from, not on npm |
| `--help`, `-h` | Print the usage |

### The directory

In a terminal, you can leave out the directory. The command then asks "Where should the app go?", with `my-app` as the default. In a script or in CI, you must give the directory.

The directory must be empty or must not exist. If it contains files, the command stops and writes nothing.

### The app name

The `name` in the app's `package.json` is the directory's name, changed into a valid npm name:

```bash
npm create nuxvel "My App"   # "name": "my-app"
npm create nuxvel .          # the current directory's name
```

`nuxvel dev` serves the app at `https://<name>.localhost`. If the directory's name has no letters or digits, the command stops and writes nothing.

## What you get

| File | Purpose |
|---|---|
| `package.json` | the `dev`, `build`, `preview`, `test`, `test:functional`, `test:ui`, `test:e2e`, `test:arch`, `typecheck`, `storybook` and `storybook:build` scripts. `@nuxvel/nuxt` and `@nuxvel/cli` use the version range of `create-nuxvel` (`^<version>`). `allowScripts` lets npm 11 run the install scripts of `esbuild`, `msgpackr-extract`, `msw` and `vue-demi` |
| `nv` | runs the `nuxvel` CLI installed in the app: `./nv db:migrate`, `./nv make:action create-task`. On Windows, run `node nv db:migrate` |
| `nuxt.config.ts` | `modules: ['@nuxvel/nuxt']` and the `nuxvel` block. The block sets [`mail.from`](./mail.md#configuration), [`auth.signInPath`](./auth.md#protecting-pages) to `/sign-in`, [`seo`](./seo.md), [`pwa`](./pwa.md) and [`queue.outboxRetention`](./queues.md#pruning-the-outbox). The other options are there as comments. The `i18n` key sets two [locales](./i18n.md#configuration), English (`en`) and Chinese (`zh`). The file also sets `<html lang="en">`. With two locales, the `lang` of each page comes from its locale |
| `locales/en.json`, `locales/zh.json` | the [translations](./i18n.md#translation-files) of each page, layout and component of the starter. The two files have the same keys. To keep only English, see [Keeping only English](./i18n.md#keeping-only-english) |
| `README.md` | the first run, the dev summary, signing up, `nuxvel tinker` and Storybook, then one step each to add a table, a resource with its pages, a migration, a page and a test |
| `app/app.vue` | the app inside Nuxt UI's `<UApp>`, with the route and form announcers. `<UApp :locale>` gets [`useUiLocale()`](./i18n.md#nuxt-ui-and-dates) |
| `app/app.config.ts`, `app/assets/css/main.css` | the theme: the `crimson` primary color, the `stone` neutral color and the Geist and Geist Mono fonts, which `@nuxt/fonts` (bundled with Nuxt UI) downloads. `main.css` imports Tailwind, Nuxt UI and `@nuxvel/nuxt/ui.css`, then defines the `crimson` scale and the fonts. Change the colors in `main.css` and `app.config.ts` |
| `app/components/AppLogo.vue`, `app/components/AppLogoMark.vue` | the logo in the layouts and on `app/error.vue`. Replace the mark to brand the app |
| `app/layouts/` | the `home`, `default`, `app` and `auth` [layouts](./frontend.md#layouts), built with Nuxt UI. `default` and `app` show the [maintenance banner](./maintenance.md#the-banner) and the [notification bell](./notifications.md). `app` also shows `<UserMenu>`. `default` also shows the [install prompt](./pwa.md#the-install-prompt). Each layout shows `<LocaleSwitcher>`. Each page, layout and component gets its text with `$t`, and links with `$localeRoute()`, so a link on a `/zh/...` page opens the `/zh/...` page |
| `app/components/LocaleSwitcher.vue` | the [locale switcher](./i18n.md#links-and-the-locale-switcher). It opens the same page in the locale that the user selects. For a signed-in user, it also saves the locale with `authClient.updateUser({ locale })`. With one locale, it shows nothing |
| `app/components/UserMenu.vue` | the menu of the signed-in user in the `app` layout: the email and **Sign out**. A signed-out visitor sees a **Sign in** link |
| `app/components/UserMenu.stories.ts` | the [component tests](./testing.md#component-tests) of `UserMenu`: signed in, signing out and signed out, with `mockUser` |
| `app/error.vue` | the error page. It shows the status, the message and the request ID, so a user can quote the ID to you. It renders `<Maintenance>` in [maintenance mode](./maintenance.md). Its `<UApp>` also gets `useUiLocale()` |
| `app/error.stories.ts` | the component test of the 404 page: the status, the heading, the message and the request ID |
| `app/pages/index.vue` | the welcome page, on the `home` layout. It shows the hero, a card of next steps whose commands copy to the clipboard, and six cards that link to the guides. The header shows **Sign in** and **Sign up** links, or the signed-in user's email menu with **Sign out** and the [push notification toggle](./pwa.md#subscribing-a-device). In development only, a footer shows the nuxvel, Nuxt and Node versions and whether Postgres and Redis are reachable. It sets its title with [`useSeo()`](./seo.md#page-metadata) |
| `app/pages/sign-up.vue`, `app/pages/sign-in.vue` | the [sign-up and sign-in pages](./auth.md#the-sign-in-and-sign-up-forms), on the `auth` layout. Each page renders `<AuthForm>`, which opens `/` when it succeeds. Under the form, each page shows a button per [social provider](./auth.md#social-login) that the app turns on |
| `app/pages/offline.vue` | the page that the service worker shows when the device is offline. See [Progressive web app](./pwa.md#the-offline-page) |
| `app/components/OgImage/Default.takumi.vue` | the default [Open Graph image](./seo.md#open-graph-images) of each page |
| `public/` | the favicon (`favicon.ico` and `favicon.svg`) and the two app icons that `nuxvel.pwa.icons` names |
| `server/database/schema/` | the tables nuxvel needs: auth, audit log, outbox, backfills, flag exposures, flag conversions, mail suppressions, notifications, API keys, push subscriptions and webhook endpoints |
| `server/database/migrations/` | the migrations for those tables. `audit_log` is partitioned by month |
| `server/factories/users.factory.ts` | `userFactory`, a [factory](./testing.md#factories) for the `user` table. `userFactory.withPassword(password)` also writes the [credential account](./testing.md#users-with-a-password) |
| `server/seeders/database.seeder.ts` | the [seeder](./database.md#seeding) that creates the demo user `demo@example.com` and three other users |
| `server/privacy/` | [user data declarations](./privacy.md) for the `user`, `flag_exposures`, `flag_conversions`, `notifications`, `api_keys` and `push_subscriptions` tables, so `nuxvel user:erase` works immediately |
| `drizzle.config.ts` | the Drizzle Kit config: schema in `server/database/schema/`, migrations in `server/database/migrations/` |
| `docker-compose.yml` | Postgres, Redis, Mailpit and SeaweedFS, with named volumes. Each service accepts connections from this computer only (127.0.0.1) |
| `.env.example` | the app's env vars in groups, each with a one-line explanation above it. The optional variables are there as comments. [Configuration](./index.md#configuration) lists every variable |
| `.env` | a copy of `.env.example` with a new random `NUXT_AUTH_SECRET` |
| `.claude/skills/nuxvel/` | the `nuxvel` skill for an AI coding agent, such as Claude Code. `SKILL.md` holds the rules and sends the agent to one file in `resources/`: `cli.md`, `files.md`, `server.md`, `background.md`, `app.md`, `testing.md` or `i18n.md`. Each file is a short reference of the API. Edit them to add the rules of your app |
| `.storybook/` | the [Storybook](./storybook.md) setup. `main.ts` shows the stories of `app/` and the nuxvel components. `preview.ts` starts [MSW](./storybook.md#mocking-the-server), with its worker in `public/`. `preview-head.html` sets the color-mode stub of Nuxt UI. `nuxvel make:story` adds a story |
| `.gitignore` | ignores `node_modules`, `.env`, build output (`storybook-static` included) and `.nuxvel/`, but keeps `.nuxvel/generated.json`, `.nuxvel/templates/`, `.nuxvel/known_hosts` and `.nuxvel/rehearsals.json` |
| `.dockerignore` | keeps `node_modules`, `.git`, `.env`, `.env.deploy`, `.data` and build output (`.nuxt`, `.output`, `.nuxvel`, `dist`) out of the Docker build context |
| `Dockerfile` | a multi-stage `node:24-bookworm-slim` build. The image runs `.output/server/index.mjs` as the `node` user on port 3000. `nuxvel build` uses it ([Building for production](./build.md)) |
| `.github/workflows/ci.yml` | on a push to `main` and on each pull request: `npm ci`, `cp .env.example .env`, `npm run typecheck`, `npx nuxvel test`, `npx nuxt build` |
| `vitest.config.ts` | the test config. See [The tests](#the-tests) |
| `tests/setup/database.ts` | recreates and migrates the test database before each test run |
| `tests/functional/health.test.ts` | the functional tests of the server. They check that the app reaches its database and Redis, signs a user up, answers a missing page with status 404 and sends a password reset mail |
| `tests/functional/seeders.test.ts` | runs the seeder and signs the demo user in |
| `tests/e2e/home.test.ts` | the end-to-end tests. Each test is a journey in a browser, with [`visit`](./testing.md#visit) and [`expect`](./testing.md#expect): sign up, reset a forgotten password from the link of the mail and sign in with the new password, and open a missing page with `{ status: 404 }` and go home. The [smoke test](./testing.md#smoke-tests) opens each page with `expectNoSmoke` |
| `.nvmrc` | Node 24. The Dockerfile and CI use the same version |

### The tests

Tests use the database `<database>_test`, which is `nuxvel_test` with the default `.env`. `tests/setup/database.ts` recreates and migrates it before each run. Tests never touch your dev data.

`vitest.config.ts` lists `@nuxvel/nuxt/testing/global-setup`, which builds the app for tests. The next run uses the same build again while the app's inputs do not change. It also lists `@nuxvel/nuxt/testing/database`, which gives each test file its own copy of the test database and its own Redis database. Thus the test files run in parallel. It also lists `@nuxvel/nuxt/testing/setup`, which starts the app for each test file from that build. A test file does not call a setup function. Every test also gets the matchers and fakes from `@nuxvel/nuxt/testing`. This includes the tests that `nuxvel make:*` writes next to your code. See [Testing](./testing.md).

`./nv test` runs the functional tests: every test except the end-to-end tests in `tests/e2e/` and the stories. `npm run test:ui` runs the stories of `app/` as [component tests](./testing.md#component-tests). `npm test` runs the functional tests, then the component tests. `npm run test:e2e` installs the Playwright browser, then runs the end-to-end tests with `nuxvel test:e2e`. See [End-to-end tests](./testing.md#end-to-end-tests). `npm run test:arch` runs [`nuxvel test:arch`](./cli.md#nuxvel-testarch), which checks the architecture rules, the test files included.

## First run

Run these commands in the app's directory:

```bash
npm install
./nv services up
./nv test
./nv db:migrate
./nv db:seed
npm run dev
```

1. `npm install` installs the dependencies.
2. `./nv services up` starts the dev services from `docker-compose.yml` and leaves them running. `./nv services down` stops them when you are done.
3. `./nv test` runs the tests in `tests/`. The tests pass on a new app.
4. `./nv db:migrate` applies the migrations to the database in `.env`.
5. `./nv db:seed` runs `server/seeders/database.seeder.ts`. It creates the demo user `demo@example.com` and prints its password, `demo-password`.
6. `npm run dev` starts the Nuxt dev server and the queue worker. Before the dev server starts, it prints the URLs of the app, DevTools, Storybook, Postgres, Redis, Mailpit and storage. See [`nuxvel dev`](./cli.md#nuxvel-dev).

`./nv test`, `./nv test:e2e` and `npm run dev` start the dev services themselves when they are not running, and stop them again when they end. The `db:*` commands and the other commands do not start them.

The app runs at `https://<name>.localhost`, for example `https://my-app.localhost`. The first run asks for your password to trust a local certificate. To serve plain `nuxt dev` at `http://localhost:3000`, run `./nv dev --no-https`. The [CLI](./cli.md#nuxvel-dev) guide describes `nuxvel dev`.

### Signing in as the demo user

Open `/sign-in` and sign in as `demo@example.com` with the password `demo-password`. To start again from an empty database, run `./nv db:fresh --seed`. See [Seeding](./database.md#seeding).

### Signing up

1. Open `/sign-up`.
2. Enter a name, an email and a password of 12 or more characters. See [Password rules](./auth.md#password-rules).
3. Select **Sign up**.

The app creates the account, signs you in and opens `/`. The home page shows your email and a **Sign out** button. Use `/sign-in` to sign in again.

### Changing the schema

```bash
./nv db:generate
./nv db:migrate
```

After you change a file in `server/database/schema/`, run `./nv db:generate`. It writes a migration to `server/database/migrations/`. Read the SQL, then run `./nv db:migrate` to apply it. See [Database](./database.md).

## Scaffolding from a local checkout

```bash
git clone <nuxvel repo> nuxvel
cd nuxvel
npm install

node packages/create/bin/create-nuxvel.mjs ../my-app --local
cd ../my-app
npm install
./nv test
```

Use a local checkout to try changes to nuxvel before they are released. Without `--local`, the app depends on the npm release with the same version as `create-nuxvel`.

The Docker build of an app made with `--local` cannot install `@nuxvel/nuxt`. Check its production server with `npx nuxt build` on your machine instead.

`--local` points `@nuxvel/nuxt` and `@nuxvel/cli` at `file:` paths in the checkout. It also writes an `.npmrc` with `install-links=true`. npm then installs the packages as copies with their own dependencies, as a registry install does. A symlink does not work: Nuxt cannot find the modules that nuxvel installs, such as `nuxt-security`. The install runs the `prepare` script of `@nuxvel/nuxt` in the checkout, and that script replaces the stub build in `packages/nuxt/dist` with a full build. After the install, run `npm run dev:prepare` in `packages/nuxt` to get the stub build again.

### Picking up changes to nuxvel

npm copies the packages at install time. Changes to the nuxvel source do not reach the app until you install again:

```bash
rm -rf node_modules/@nuxvel package-lock.json && npm install
```

Remove `package-lock.json` too. The lock file keeps the old dependencies of the nuxvel packages, so a dependency that nuxvel added since the last install is missing without it. The next `nuxvel test` builds the app again, because the installed copies changed.

### Stopping the repo's dev services

The app's `docker-compose.yml` uses the same ports as the repo's: 5432, 6379, 1025, 8025 and 8333. If the repo's services are running, `nuxvel test` reports that its services did not start and continues with the running ones. The tests still pass, because they use their own `nuxvel_test` database.

The dev database is `nuxvel` in both. Run `docker compose down` in the checkout before you run `./nv db:migrate` or `npm run dev` in the app. If you do not, the app migrates on top of the playground's tables.

### Docker and CI

The Dockerfile and the CI workflow need published packages. A `file:` path outside the app is not in the Docker build context or in the CI checkout. Run the tests locally until nuxvel is on npm.

### Testing create-nuxvel

The repo tests `create-nuxvel` in `packages/create/test/`. There are two Vitest projects:

```bash
cd packages/create
npm test               # scaffold: checks the files and the printed output
npm run test:release   # release: installs a new app and runs its tests
```

The `scaffold` project creates apps with `--local` in a temporary directory. It checks the files, the next steps it prints, and that each command in the app's `README.md` exists. It typechecks an app with English and Chinese, then the same app with only English. It does not install the app.

The `release` project creates an app with `--local` and runs a real `npm install`. Then it runs `nuxvel make:job`, `nuxvel make:resource` with `--ui`, `nuxvel db:generate`, `npm run typecheck`, `npm run test:arch`, `npm run storybook:build`, `npm test`, `npm run test:e2e`, `nuxvel user:erase` and `nuxvel db:check`. The Storybook build must contain the nuxvel stories. It needs Docker and network access.

## Next steps

- [Database](./database.md): tables, queries and migrations
- [Validation](./validation.md): Zod schemas in `shared/schemas/`
- [API](./api.md): tRPC routers and procedures
- [Actions](./actions.md): one write operation per file
- [Auth](./auth.md): users, sessions and protected pages
- [Frontend](./frontend.md): forms, layouts and Nuxt UI
- [Testing](./testing.md): fixtures, factories and fakes
- [CLI](./cli.md): every `nuxvel` command
- [Building for production](./build.md): images and archives
