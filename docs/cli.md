# CLI

## Introduction

`nuxvel` is the command-line tool of a nuxvel app. It starts the dev server, runs the tests, migrates the database and generates files. It also runs jobs, changes feature flags and reads the audit log of a running app. Run every command from the app root.

## Installing and running

```sh
./nv --help
./nv --version
./nv db:migrate
```

The starter installs `@nuxvel/cli` and writes `nv` at the app root. `./nv` runs the version in the app's `node_modules`, like `bin/rails` or `php artisan`. On Windows, run `node nv <command>`. `npx nuxvel <command>` runs the same CLI. The CLI needs Node 24 or later. `nuxvel --version` (or `-v`) prints the version.

`nuxvel`, `nuxvel help` and `nuxvel --help` list the commands. The list uses the same groups and order as this page:

```
Production-ready backend for Nuxt: database, typed API, validation, auth, and actions. (nuxvel v0.0.1)

USAGE nuxvel <command> [OPTIONS]

Development
  dev                 Start the dev services, then `nuxt dev` ...
  test                Start the dev services, then run the project's functional tests ...
  ...

Database
  db:generate         Generate a Drizzle migration from the app's schema ...
  db:migrate          Run the pending migrations, then every contract migration, as ...
  ...

Run nuxvel <command> --help for the usage of one command.
```

The list has no colour codes when the output is not a terminal, or when `NO_COLOR` is set.

An unknown command exits with code 2. The CLI writes the error and the command list to stderr. When the unknown name is part of a command name, the hint suggests that command:

```
✖ Unknown command "migrate"
  → Did you mean nuxvel db:migrate?
```

`nuxvel <command> --help` (or `-h`) shows the usage of one command. `nuxvel help <command>` shows the same usage. A passthrough command (`test:functional`, `test:e2e`, `test:ui`, `dev`, `db:generate`, `db:studio`) gives `--help` to its tool instead. For example, `nuxvel test:functional --help` shows the help of Vitest and starts no services. `nuxvel --help test:functional` still shows the help of nuxvel.

### Commands that run inside the app

Some commands load the app and run inside its own Nitro server:

- `tinker`, `task:run`, `route:list`, `channel:list` and `openapi:export`
- `key:issue`
- `db:seed`, and the seed step of `db:fresh --seed`
- `queue:*` and `schedule:*`
- `flag:*` and `experiment:*`
- `audit:*`, `user:*` and `backfill:status`
- `down`, `up` and `maintenance:status`
- `make:loadtest`, and the stored-names and maintenance checks of `doctor`

The CLI builds the server part of the app and starts it with the command. The server stops when the command is done. Nuxt loads `nuxt.config.ts`, its modules and `.env` for this build, with no client bundle. Auto-imports, aliases such as `~~/`, runtime config with its `NUXT_*` overrides and anything that a module adds work the same as in `nuxt dev`.

`event:list` and `test:arch` only load the config of the app to find its files. They do not build the server.

These commands need what the server needs at boot: `NUXT_DATABASE_URL`, and a `NUXT_AUTH_SECRET` of at least 32 characters. The CLI checks them before it builds anything, so a missing variable fails in about a second. A value that `runtimeConfig` in `nuxt.config.ts` sets counts too.

```
✖ NUXT_DATABASE_URL is not set
  → Set it to the app's Postgres URL, e.g. postgres://app:secret@db:5432/app
```

Only this CLI build can run a command. The output of `nuxt build` has no command runner, so no environment variable makes a production server run a command.

### The server build and its cache

The first command that runs inside the app builds the server. The next commands use the same build while its inputs stay the same.

The build goes to `node_modules/.cache/nuxvel/server/<hash>/`, with a build directory of its own. It never writes to the `.nuxt` directory of the app, so a running `nuxt dev` is not affected.

The build has only the server. It has no client bundle, no Vue renderer, and no icon bundle of `@nuxt/icon`. No command serves pages or icons, so the server needs none of them.

While it builds, stderr shows a spinner with the last lines of the build. The title names the first input that changed since the last build of the app. When the build is done, one line stays:

```
◇ Built the app's server: server/flags/new-checkout.flag.ts added (8.7s)
```

The first build of an app says `no earlier build`. A command that uses the cached build prints the time of that build:

```
◇ Using the server build from 9/25/2026, 12:46:15 PM
```

Outside a terminal, or under `CI`, only the last line prints. A failed build prints `✖ Could not build the app's server`, a hint and the full build output. When the build output reports a `tsconfig.json` problem, the hint is `→ Run nuxt prepare in the app: its tsconfig.json points at types that are not written yet`. The `tsconfig.json` of the app points at the types that `nuxt prepare` writes. The starter runs `nuxt prepare` in `postinstall`.

The hash covers the inputs of the server build:

- The files of the app and its local layers. The hash skips `node_modules`, the build directory, `.output` and dotfiles other than `.nuxtrc` and `.npmrc`. It also skips what the server build does not read:
  - the `app/` directory, except `app/app.config.*`
  - the `public/` directory
  - Markdown files at the root, `test/` and `tests/`
  - each path that the `ignore` option of Nuxt skips, such as `*.test.ts` and `*.spec.ts`
  - in a git repository, each file that git ignores. `.nuxtrc` and `.npmrc` stay in the hash. Outside a git repository, the hash reads every file.
- The resolved `nuxt.config`.
- The version of each dependency, and the files of each local dependency, with the same skips. A local dependency is a workspace package or a `file:` or `link:` package. The hash reads the installed files. So when npm installs a `file:` package as a copy, each new install of it builds the app again, also when its version stays the same. For a linked `@nuxvel/nuxt`, the hash also skips `client-dist/`, the DevTools client that its install builds from `client/`.
- The lockfile, and the Node and nuxvel versions.
- `NODE_ENV`, the `VITE_*` variables and each environment variable that the last build read, `.env` included. The CLI records the variables that the build reads. A variable that the build does not read, such as `PATH` or a terminal session id, is not an input. A variable that the server reads only when it starts, such as `NUXT_DATABASE_URL`, is not an input. Thus a new shell, `npx`, `npm run` and `./node_modules/.bin` use the same build. A change to a variable that the build reads prints its name, for example `◇ Built the app's server: env NUXVEL_DEVTOOLS changed`.

So an edit to a page, a component, a test or the README uses the cached build. An edit to a file under `server/` or `shared/`, to `nuxt.config.ts` or to the lockfile builds again. Two commands that start at the same time build once: the second waits for the build of the first. The CLI keeps the last two builds of each app. It removes an older build only when no command still runs from it, so a long `queue:work` is safe.

The table shows `nuxvel flag:list` on a copy of the playground, on an Apple Silicon laptop at a load average of about 50:

| Run | Time |
| --- | --- |
| First run, no cached build | 12.6 s (the build takes 8.7 s of it) |
| Next run, cached build | 3.7 to 3.9 s |
| First run of `nuxt dev`, until its Nitro server is ready | 16.7 s |

Of a cached run, about 0.6 s computes the hash and 2.5 to 4 s starts the server. The start time comes from Node, which loads the modules of the app's dependencies.

A command does not run in the dev server of Nuxt instead of a build. The dev server also builds the Nitro server with Rollup, and it does so on each start with no cache. The measured start above is slower than a first run with a build, and much slower than a cached run. A loader such as `jiti` or `vite-node` could import the files under `server/` with no build. But then the virtual modules of Nitro and nuxvel, such as `#imports` and `#nuxvel/schema`, and the auto-imports would not exist, so a command would not see the app as the server sees it.

### Output and exit codes

A command writes its result to stdout: a list, a created path, JSON. Progress, status lines and errors go to stderr, so `nuxvel route:list > routes.txt` contains only the table.

The same applies to the commands that run inside the app. `flag:set` and `queue:retry` print their `✔` line on stderr. The log lines of the app also go to stderr, in the `pretty` format unless `NUXT_LOG_FORMAT` is set. So `nuxvel user:export <id> | jq` gets only the JSON. A command exits only after it writes all of its output, so a slow reader of `audit:export` or `user:export` loses no rows.

An error is one line and a hint:

```
✖ Missing required positional argument: NAME
  → Run nuxvel make:job --help for its usage
```

| Exit code | Meaning |
| --- | --- |
| `0` | Done |
| `1` | Failed, or found problems |
| `2` | Usage error: unknown command, missing or invalid argument |

An invalid flag value is a usage error. For example, `nuxvel flag:set new-checkout --percentage 200` exits `2`:

```
✖ --percentage must be a number from 0 to 100
  → e.g. --percentage 25
```

In a terminal, a command asks for a missing required argument. For example, `nuxvel make:job` asks for the name of the job. When stdin or stderr is not a terminal, a missing argument is a usage error. The error names the argument and points at the help of the command, for example `→ Run nuxvel make:job --help for its usage`. The commands that run inside the app report their errors the same way, and exit `1`:

```
✖ no flag named "nope"
  → Run nuxvel flag:list to see the flags
```

The listing commands print a table with a header row. Each one takes `--json` to print one JSON document to stdout instead, with the same exit code. The listing commands are `route:list`, `channel:list`, `event:list`, `schedule:list`, `queue:failed`, `queue:versions`, `flag:list`, `flag:stale`, `experiment:report`, `backfill:status`, `maintenance:status`, `audit:verify`, `doctor`, `build:verify`, `release:list`, `status` and `server:status`.

```sh
nuxvel route:list --json | jq '.collisions'
```

A passthrough command (`nuxvel test:functional`, `nuxvel test:e2e`, `nuxvel test:ui`, `nuxvel dev`, `db:generate`, `db:studio`) exits with the exit code of its tool. A non-zero code ends with a line such as `✖ vitest exited with code 1`. When a signal that nuxvel did not send stops the tool, for example an out-of-memory kill in CI, nuxvel exits `128` plus the number of the signal. For `SIGKILL` that is `137`, with `✖ vitest was killed by SIGKILL`. Ctrl-C (or `SIGTERM`) goes to the running tool, and nuxvel stops the same way after the tool exits.

nuxvel runs the `nuxt`, `vitest` and `drizzle-kit` of the project from the entry file of their package, with the Node that runs nuxvel and no shell. So they work the same on Windows. When a tool is not installed, the error names it and says how to install it:

```
✖ Could not run vitest
  → Install it in this project (npm i -D vitest) and run nuxvel from the project's directory
```

An unexpected error prints its message only. Run the command again with `DEBUG=nuxvel` to see the stack. `NO_COLOR=1` turns colours off. Outside a terminal, or in CI (`CI` set, or a CI provider such as GitHub Actions that `std-env` detects), a spinner prints one line for each step and does not redraw.

## Development

### `nuxvel dev`

```sh
nuxvel dev [--https | --no-https] [--no-queue] [nuxt dev arguments]
```

| Flag | Description |
| --- | --- |
| `--https` | Serve through portless at `https://<app>.localhost`, also outside a terminal or in CI. |
| `--no-https` | Run plain `nuxt dev`, with no proxy and no certificate. |
| `--no-queue` | Start the dev server without the queue worker. |

`nuxvel dev` starts the dev services of the app, waits until they are healthy, then starts the dev server. The dev services are the ones in `docker-compose.yml`, as for [`nuxvel test:functional`](#nuxvel-testfunctional). The dev server is the `nuxt dev` of the project. Other arguments go to `nuxt dev`.

```sh
nuxvel dev                          # https://blog.localhost
nuxvel dev --no-https               # plain nuxt dev, http://localhost:3000
nuxvel dev --no-https --port 4000
```

`nuxvel dev` sets `NUXT_SITE_URL` to the app URL that it prints, `https://<app>.localhost` or `http://localhost:<port>`, so the links in the mails work without a setting. A `NUXT_SITE_URL` in the shell or in `.env` wins.

`nuxvel dev` adds `--enable-source-maps` to `NODE_OPTIONS`. The Nitro dev server is one bundle, `.nuxt/dev/index.mjs`, and it ships a source map. With the option, the stack of a server error in the terminal shows the file of your app, for example `server/api/tasks.get.ts:12`, and not a line of the bundle. The Nitro dev worker inherits `NODE_OPTIONS`.

When the dev services are healthy, `nuxvel dev` compares the database with the migrations. It stops before the dev server starts, and exits `1`, when a migration is pending:

```
✖ 1 pending migration: 0016_webhook-endpoints
  → Run nuxvel db:migrate, then nuxvel dev again
```

It also stops when a migration that ran was edited, with the error of [`nuxvel db:migrate`](#nuxvel-dbmigrate). When it cannot connect to the database, it does not stop.

Then `nuxvel dev` creates the missing monthly partitions of the audit log, as `nuxvel db:migrate` does. It connects as `NUXT_DATABASE_OWNER_URL`, or as `NUXT_DATABASE_URL`. When the database has no `audit_log` table yet, it does nothing. When it cannot connect, it shows a warning and continues. See [Audit log](./audit.md#partitions-in-development).

```
◇  Audit log partitions: created 0, dropped 0
```

When the dev services are healthy, and before the output of `nuxt dev`, `nuxvel dev` prints one block with the addresses of the app and its services:

```
  App       https://blog.localhost
  DevTools  https://blog.localhost/__nuxt_devtools__/client/
  API docs  https://blog.localhost/api/v1/docs
  Postgres  postgres://nuxvel:nuxvel@localhost:5432/nuxvel
  Redis     redis://localhost:6379
  Mailpit   http://localhost:8025
  Storage   http://localhost:8333 (bucket nuxvel)
  Queue     runs inside the dev server
```

| Row | Source |
| --- | --- |
| `App` | The portless URL, from `portless get <app>`. With plain `nuxt dev`: `http://localhost:<port>`, from `--port`, `PORT`, `NUXT_PORT` or `3000`. |
| `DevTools` | The Nuxt DevTools client of the app. In the browser, `Shift` + `Alt` + `D` also opens it. |
| `API docs` | The [API reference page](openapi.md#the-api-reference-page), `<app><api.restPrefix>/docs`, when `nuxvel.api.openapi` is set in `nuxt.config.ts`. |
| `Postgres` | `NUXT_DATABASE_URL`. |
| `Redis` | `NUXT_REDIS_URL`. |
| `Mailpit` | The published port of port `8025` of the `mailpit` service, from `docker compose ps`. |
| `Storage` | `NUXT_STORAGE_URL` without its access key and secret, and `NUXT_STORAGE_BUCKET`. |
| `Bugsink` | The published port of port `8000` of the `bugsink` service, from `docker compose ps`. |
| `Queue` | `runs inside the dev server`, or `off (--no-queue)`. |

The environment variables come from the shell, then from `.env`, the same as for [`nuxvel db:migrate`](#nuxvel-dbmigrate). A row with no value is not printed. Outside an interactive terminal, the block has no colour codes.

In a terminal, `nuxt dev` runs behind [portless](https://github.com/vercel-labs/portless) at `https://<app>.localhost`. `<app>` is the `name` in `package.json`, without its scope, in lowercase. portless picks a free port for `nuxt dev` through `PORT`. It proxies the HTTPS origin to that port, with a certificate from its own local CA. portless prints the URL of the app.

The first run asks for your password one time, to bind port 443 and to trust that CA. To stay off the privileged port, start the proxy yourself with `npx portless proxy start -p 1355`. The app is then at `https://<app>.localhost:1355`. Sign-in and tRPC mutations work on the proxied origin the same as on `localhost`. The dev SeaweedFS accepts uploads from all origins.

`nuxvel dev` does not start Storybook. Run `npm run storybook` next to it. See [Storybook](./storybook.md#running-storybook).

Outside an interactive terminal, or in CI, portless cannot ask for your password. There, `nuxvel dev` runs plain `nuxt dev` and says so. This applies to a Playwright `webServer` and to a CI job. Pass `--https` to use portless there too.

```sh
CI=1 nuxvel dev
# ▲ Not in an interactive terminal (or CI is set): running plain nuxt dev
#   → Pass --https to serve through portless anyway
```

`nuxvel dev` also runs the queue worker inside the dev server, so jobs, queued listeners, mail and schedules run. It starts `nuxt dev` with `NUXVEL_ROLE=worker`, as [`nuxvel queue:work`](#nuxvel-queuework) does with the built server. The worker writes its log lines, with the tag `job`, to the output of the dev server. When the dev server reloads after a change, the worker restarts with the new code. When you stop `nuxvel dev`, the worker stops too.

`nuxvel dev` starts `nuxt dev` with `NUXT_LOCK=1`. Nuxt then writes `.nuxt/nuxt.lock` while the dev server runs, and a second `nuxt dev` in the same folder refuses to start. The `make:*` generators read this file and do not run `nuxt prepare`, which would remove `.nuxt` under the dev server. See [Generators](#generators).

When the project has no `nuxt` installed, the command says so and exits `1`.

### `nuxvel test:functional`

```sh
nuxvel test:functional [vitest arguments]
```

`nuxvel test:functional` is the command that `npm run test:functional` runs. There is no `nuxvel test`: `npm test` of the starter runs `test:functional`, then `test:ui`.

`nuxvel test:functional` starts the dev services, then runs the tests of the project with `vitest run`. Vitest uses the config that the project directory resolves. Other arguments go to Vitest, so you can run one file or filter by name. It runs only the `functional` project of the Vitest config (`vitest run --project functional`), so no end-to-end test runs, wherever its `tests/e2e/` folder is. `--changes-only` and `--watch` run that project too. Run the end-to-end tests with [`nuxvel test:e2e`](#nuxvel-teste2e). The test files run in parallel, and each file gets its own copy of the test database. See [Testing: Vitest configuration](./testing.md#vitest-configuration).

```sh
nuxvel test:functional
nuxvel test:functional server/actions/posts/create-post.action.test.ts
nuxvel test:functional -t "creates a post"
```

With `--changes-only`, the command runs only the test files that the changes since the last `--changes-only` run can affect. It prints how many test files it replays as passed. When it must run all test files, it prints the reason. When `CI` is set, it runs all test files. See [Run only the changed tests](./testing.md#run-only-the-changed-tests) for the rules.

```sh
nuxvel test:functional --changes-only
```

With `--watch`, the command runs the affected test files, then waits. Each time a project file changes, it selects the affected test files again and runs them. It does not watch `node_modules`, `dist` and the folders whose names start with `.`. A new run starts only after the current run ends. Push Ctrl-C to stop the command.

```sh
nuxvel test:functional --watch
```

The dev services are every service in the `docker-compose.yml` (or `compose.yml`) of the project. In the starter, these are Postgres, Redis, Mailpit and SeaweedFS. nuxvel starts them with `docker compose up -d --wait` and waits until they are healthy, so the tests run on a machine where nobody started them. When each service is already healthy, nuxvel does not run `docker compose up` and prints `◇ Dev services are already healthy (docker compose)`. When they run but were created from an older compose file, nuxvel runs `docker compose up -d --wait`, which recreates the changed ones, prints `◇ Updated dev services to the compose file (docker compose)` and leaves them running when it ends. When the command ends, Ctrl-C included, nuxvel stops the services that it started with `docker compose stop` and prints `◇ Stopping dev services (docker compose)`. The data in the volumes stays. Services that were already running stay running, so a `nuxvel dev` in one terminal is not stopped by a `nuxvel test:functional` in another. `nuxvel dev`, `nuxvel test:e2e` and `nuxvel test:compat` do the same. The compose output scrolls under one status line, and the line collapses when the services are healthy.

A project with no compose file skips this step with no output. When Docker is not installed, or compose fails, nuxvel prints the problem with the full compose output and runs the tests anyway:

```
✖ docker is not installed
  → Install Docker Desktop, or start the services yourself; continuing without them
```

`docker compose --wait` has no timeout of its own. A service whose healthcheck never passes keeps the command waiting.

Run `nuxvel test:functional` from the project directory, the one that holds `vitest.config.ts`. nuxvel finds Vitest the way Node finds a package: in the `node_modules` of the project, or of a parent directory such as a workspace root. When Vitest is not installed there, the command says so and exits `1`.

### `nuxvel test:e2e`

```sh
nuxvel test:e2e [--headed] [--devtools] [--debug] [vitest arguments]
```

`nuxvel test:e2e` starts the dev services, then runs the `e2e` project of the Vitest config, the tests in every `tests/e2e/` folder, with `vitest run --project e2e`. Other arguments go to Vitest. The tests drive a Playwright browser. See [End-to-end tests](./testing.md#end-to-end-tests).

The browser must be installed. The starter's `npm run test:e2e` script installs it with `playwright-core install chromium-headless-shell` before the command runs.

`--headed` shows the browser. It sets `NUXVEL_HEADED=1`. `--devtools` shows the browser with the Chrome DevTools open. It sets `NUXVEL_DEVTOOLS=1`. `--debug` shows the browser, opens the Playwright inspector and turns the test timeouts off. It sets `PWDEBUG=1`. A visible browser needs the full Chromium: `npx playwright-core install chromium`. See [Debug a browser test](./testing.md#debug-a-browser-test).

### `nuxvel test:ui`

```sh
nuxvel test:ui [vitest arguments]
```

`nuxvel test:ui` runs the stories of the project as Vitest browser tests, the `ui` project of the Vitest config, with `vitest run --project ui`. It sets `NUXVEL_TEST_UI=1`, because the starter's config loads the `ui` project only when this variable is set. Other arguments go to Vitest. It starts no dev services. A story fails when it does not render or when its `play` function throws. See [Component tests](./testing.md#component-tests).

The browser must be installed. The starter's `npm run test:ui` script installs it with `playwright-core install chromium-headless-shell` before the command runs.

### `nuxvel services`

```sh
nuxvel services up
nuxvel services status
nuxvel services down
```

`nuxvel services` controls the dev services of the project, from its `docker-compose.yml` (or `compose.yml`). `nuxvel dev`, `nuxvel test:functional` and the `db:*` commands use them. Start them once, and then each `nuxvel dev` or `nuxvel test:functional` run starts without the compose step and leaves them running.

- `up` starts the services with `docker compose up -d --wait` and waits until they are healthy.
- `status` prints one line for each service with its state, for example `✔ postgres  healthy` or `✖ redis  not created`. It exits `1` when a service is not healthy.
- `down` stops the services and removes their containers with `docker compose down`. The data volumes stay.

Without a compose file, the command exits `1`. When Docker is not installed, `up` and `down` exit `1` with a hint.

### `nuxvel test:arch`

```sh
nuxvel test:arch
```

`nuxvel test:arch` checks the architecture rules of the framework against the project:

- A file under `server/actions/**` does not import `h3`, call `requireAuth()`, or call the auto-imported h3 request helpers (`useEvent`, `getHeader`, `getQuery`, `readBody`, `getCookie`, ...). An action takes an actor. It does not read the request.
- Each action file holds one action, exported under the camelCase name of the file. `server/actions/posts/archive-post.action.ts` exports `archivePostAction`, and `archive-post.ts` exports `archivePost`.
- A file under `server/trpc/routers/**` does not call `useDb().insert|update|delete`, `insertOne()` or `updateOne()`. A router calls an action.
- Each `.query()` and `.mutation()` on a `*Procedure` (`publicProcedure`, `authedProcedure`, ...) has an `.output()` schema, so the browser gets only the fields that the schema lists. See [API: writing a router](./api.md#writing-a-router).
- A file under `server/api/**` or `server/routes/**` does not call `useDb().insert|update|delete`, `insertOne()` or `updateOne()`, and does not import an action. A write goes through a tRPC mutation that calls an action. The rule skips probes (`server/api/_*`) and routes in a `webhooks`, `uploads` or `auth` folder.
- A table under `server/database/schema/**` with a column that references the user table, such as `userId` or `ownerId`, has a `defineUserData()` declaration in `server/privacy/`. The rule skips the `session`, `account` and `two_factor` tables of Better Auth, and the `audit_subjects` table of the audit log.
- A listener under `server/listeners/**` with `sync: true` does not call `fetch`, `$fetch`, `ofetch`, `sendMailNow`, `useS3`, `useBucket`, `promoteUpload` or `checkUpload`. A sync listener runs inside the transaction of the action. Remove `sync: true` to queue the listener.
- A listener does not `emit()` the event that it listens to. Such a listener runs again for its own event, in a loop.
- A `.vue` file under `app/` does not use `v-html`. Render user HTML with `<SafeHtml :html>`, see [Frontend: rendering HTML](./frontend.md#rendering-html).
- A `.vue` or `.ts` file under `app/` uses a route name, not an internal path string, in a link. The rule checks the `to` of `<NuxtLink>`, `<ULink>` and `<UButton>`, and the first argument of `navigateTo()`, `router.push()` and `router.replace()`. It flags a string or a template literal that starts with `/`, for example `to="/sign-in"`. Use `:to="{ name: 'sign-in' }"`: the typecheck then fails when the page moves. Paths under `/api`, `/webhooks` and `/_nuxvel`, and full URLs, are correct.
- Each translation file of the default locale, for example `locales/en.json` or `locales/pages/posts/en.json`, has a file next to it for each other locale of `i18n.locales`, with each of its keys. Two layers of the app do not give the same key of the default locale different texts. A literal key in a `.vue` or `.ts` file under `app/` is in a translation file of the default locale: the first argument of `$t`, `$ts`, `$tc`, `t`, `ts` and `tc`, both strings of a `cond ? "a" : "b"` argument, and the `keypath` of `<i18n-t>`. The rule `nuxvel/translation-keys` checks the keys; it skips a key built at runtime, such as `` $t(`status.${state}`) ``. See [Internationalization: missing translations](./i18n.md#missing-translations).
- A `.ts` file under `server/**` does not read the audit tables. It does not import `auditLogTable`, `auditSubjectsTable`, `auditContextTable` or the `audit-log.schema` file, and it does not read these names as a property (for example `schema.auditLogTable` after `import * as schema from "#nuxvel/schema"`). It does not call `schemaTable()` with `"audit_log"`, `"audit_subjects"` or `"audit_context"`. No `sql` template and no `sql.raw()` string in it names these tables. The audit log is for compliance only. A feature that shows history keeps its own table, see [Audit log: showing history in the app](./audit.md#showing-history-in-the-app). The rule skips `server/database/schema/audit-log.schema.ts` and test files. Writes with `audit()` and the `audit` option of an action are correct.
- A functional test does not read the HTML of a page. The rule flags a `$fetch` of a page path, a `$fetch<string>` of a path that is not a string literal, and `.text()` on the response of a `fetch` of a page path or of a `fetch` with an `accept: text/html` header. A page path starts with `/`, is not under `/api`, `/webhooks` or `/_nuxvel`, and has no file extension, also at the end of a template string such as `` `/locales/${locale}/data.json` ``. Check what a page shows in a story `play` function (`nuxvel test:ui`) or with `visit()` (`nuxvel test:e2e`). `getMeta()`, reads under `/api`, `/robots.txt`, and checks of the status or the `location` of a page response are correct. A functional test is a `.ts` file under `tests/` but not under `tests/e2e/`, or a `.test.ts` file under `server/`.
- A `.ts` or `.vue` file under `server/`, `app/`, `shared/` or `tests/` does not climb with `../` out of its kind folder (`server/actions/`, `server/database/schema/`, `app/components/`, `tests/`, ...) into another one. It imports a table from `#nuxvel/schema`, a factory from `#nuxvel/factories`, other server code from `#server/*`, `shared/` from `#shared/*` and `app/` from `~/*`. A file in `app/` or `server/` does not import `shared/schemas/`, whose exports are auto-imported there. `nuxvel upgrade --only imports` fixes both, see [Imports](./auto-imports.md#imports).
- A test file or a story does not import `expect` from `vitest`, `playwright/test`, `@playwright/test` or `storybook/test`. A test imports `expect` from `@nuxvel/nuxt/testing`, and a story imports it from `@nuxvel/nuxt/storybook/test`. The built-in ESLint rule `no-restricted-imports` makes this check. It covers the `.ts` files under `tests/`, the `.test.ts` files under `server/` and the `.stories.ts` files under `app/`.

The command prints one `✖` line for each violation on stderr, then a summary, and exits `1`. Add it to CI next to `nuxvel test:functional`.

```
✖ server/actions/posts/archive-post.action.ts: actions may not import h3, call requireAuth(), or read the request (useEvent, getHeader, readBody, ...)
✖ server/trpc/routers/posts.router.ts: routers may not call useDb().insert/update/delete, insertOne() or updateOne(), call an action
✖ 2 architecture violations
```

A clean project prints `✔ All architecture rules pass`.

The command also prints one `▲` warning for each definition file without its kind suffix, for example `server/jobs/post/notify.ts` instead of `notify.job.ts`. See [Names come from paths](./index.md#names-come-from-paths) for the suffixes. A warning does not change the exit code. Tests and `.d.ts` files get no warning.

```
▲ server/jobs/post/notify.ts: add the kind suffix, rename it to notify.job.ts
```

The rules are the ESLint rules `nuxvel/action-imports`, `nuxvel/action-naming`, `nuxvel/router-db-writes`, `nuxvel/router-output`, `nuxvel/route-writes`, `nuxvel/sync-listener-network`, `nuxvel/listener-emit-loop`, `nuxvel/user-data-declared`, `nuxvel/no-raw-v-html`, `nuxvel/typed-routes`, `nuxvel/translation-keys`, `nuxvel/module-imports`, `nuxvel/no-audit-reads`, `nuxvel/billing-writes`, `nuxvel/functional-page-html`, `nuxvel/test-each`, `nuxvel/test-auth`, `nuxvel/test-client`, `nuxvel/no-parent-imports` and `nuxvel/shared-imports`, and the `expect` import check of `no-restricted-imports`. The rule `nuxvel/user-data-declared` reports each table that has a column referencing the user table, such as `userId` or `ownerId`, and no `defineUserData()`. The command runs them on the action, router, route, listener and schema files that the app discovers in its `serverDir`, and on the `.vue` and `.ts` files in its `app/` folder. It runs `nuxvel/no-audit-reads` and `nuxvel/billing-writes` on all `.ts` files in its `serverDir`. It runs `nuxvel/no-parent-imports` on the `.ts` and `.vue` files in `server/`, `app/`, `shared/` and `tests/`, also in `layers/<name>/`. It runs `nuxvel/shared-imports` on the `.ts` files in `shared/` and `layers/<name>/shared/`: a file there runs in the browser, so it may not import `server/`, `#server/*`, `#nuxvel/*`, `drizzle-orm` or `@nuxvel/nuxt/database`. It runs `nuxvel/module-imports` on the `.ts` and `.vue` files in `layers/<name>/`, see [Modules](./modules.md#boundaries). The rule `nuxvel/test-each` reports `it.each`, `test.each` and `describe.each`, and `it`, `test` or `describe` called in a loop, see [Many cases in one test](./testing.md#many-cases-in-one-test). The rule `nuxvel/test-auth` reports the path `/api/auth/sign-up/email` or `/api/auth/sign-in/email` outside the body of a test, see [Users with a password](./testing.md#users-with-a-password). The rule `nuxvel/test-client` reports `$fetch`, `fetch` and `createPage` imported from `@nuxt/test-utils` or `@nuxt/test-utils/e2e`, in place of `guest()`, `actingAs(user)` and `visit()`, see [Acting as a user](./testing.md#acting-as-a-user). It runs the five test rules on the test files and stories in the project and in `layers/<name>/`. It also lints the same kinds in `server/domains/<domain>/actions/`, `routers/`, `listeners/` and `schema/`, and its layers inside the project. It skips the files that the `ignore` option of the app leaves out. The rules are also the `architecture` preset of `@nuxvel/nuxt/eslint`, so your editor can show them. The preset leaves out `nuxvel/translation-keys`, because only the command reads the translation files of each layer.

```ts
// eslint.config.ts
import typescriptParser from "@typescript-eslint/parser";
import accessibility, { architecture } from "@nuxvel/nuxt/eslint";

export default [
  ...accessibility,
  { files: ["server/**/*.ts", "app/**/*.ts"], languageOptions: { parser: typescriptParser } },
  ...architecture,
];
```

### `nuxvel test:compat`

```sh
nuxvel test:compat --against=v1.4.0
# ✔ Checked out v1.4.0 with the migrations of the working tree, without the contract migrations
# ✔ The tests of v1.4.0 pass against the new migrations
```

`nuxvel test:compat` checks that the release that is live now still works after the migrations of your change. Pass the git ref of the live release, such as a tag or `origin/main`, to `--against`. The command does these steps:

1. It checks out the files of that ref into a temporary folder. Your working tree does not change.
2. It replaces the migrations of that checkout with the migrations of the working tree, without `contract/`: a deploy runs the [contract migrations](./database.md#contract-migrations) only once the live release no longer runs.
3. It starts the dev services, as `nuxvel test:functional` does.
4. It runs the tests of that checkout, except the end-to-end tests, with `vitest run --project functional`. Their test setup migrates the test database with the new migrations.

A migration that drops or renames a column that the live release reads makes its tests fail. The command then exits with the exit code of Vitest:

```
✖ The tests of v1.4.0 fail against the new migrations
  → Keep what the live release reads for one more release, and remove it in the release after
```

The checkout uses the `node_modules` and the `.env` of the working tree. A ref that git does not know exits `1`. Run the command in CI when a change adds a migration.

### `nuxvel doctor`

```sh
nuxvel doctor [--url <url>] [--json]
```

`nuxvel doctor` checks the health of the app environment. It runs these checks:

- **environment**: the shell environment plus the `.env` of the app pass the checks that the server runs at boot. `NUXT_DATABASE_URL` is set, and `NUXT_AUTH_SECRET` has at least 32 characters. Each provider in `nuxvel.auth.social` has its `NUXT_AUTH_<PROVIDER>_CLIENT_ID` and `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET`. See [Security](./security.md#env-validation-at-boot).
- **database connection**: the database is reachable.
- **pending migrations**: no migration is pending, and each migration that ran agrees with its file. A migration file that changed after it ran fails the check. See [Migrations](./database.md#migrations).
- **stored names**: nothing is stored under a name that no definition or `renamed()` alias answers to.
- **maintenance**: the app is not in maintenance mode. When it is, the row is a warning. See [Maintenance mode](./maintenance.md).
- **cache redis**: in production (`NODE_ENV=production`), the cache has its own Redis. A warning shows when `NUXT_REDIS_CACHE_URL` is not set or has the same host and port as `NUXT_REDIS_URL`. See [Redis](./redis.md#a-separate-redis-for-the-cache).
- **bot protection**: in production, `NUXT_AUTH_TURNSTILE_SECRET_KEY` is set, so sign-up and password reset need a Turnstile token. A warning shows when it is not set. See [Bot protection](./auth.md#bot-protection).
- **security advisories**: `npm audit --omit=dev` finds no known advisory for the production dependencies of the app, Nuxt included. A finding is a warning with the count per severity. The row is skipped when `npm audit` gives no report, for example with no network.
- **mail dns**: the domain of `nuxvel.mail.from` has SPF, DKIM and DMARC records in DNS. Each missing record is a warning. The DKIM lookup tries the common selectors `default`, `google`, `selector1`, `selector2`, `k1`, `mx`, `resend`, `s1`, `s2` and `dkim`. The row is skipped when `nuxvel.mail.from` is not set or DNS does not answer. `NUXT_NUXVEL_MAIL_FROM` wins over `nuxt.config.ts`.
- **off-site backups**: each environment of `nuxvel.deploy.ts` sets `backups.offsite`, so its backups do not stay on its server only. Each one without it is a warning. The row is skipped without `nuxvel.deploy.ts`, and fails when `nuxvel.deploy.ts` does not load. See [Deploying to a VPS](./deploy.md#off-site-backups).
- **restore rehearsal**: the restore of each environment with `backups.offsite` was [rehearsed](./deploy.md#rehearsing-a-restore) in the last 90 days, by `.nuxvel/rehearsals.json`. A missing or older rehearsal is a warning. The row is skipped without `nuxvel.deploy.ts` or without an environment that has `backups.offsite`. It fails when `nuxvel.deploy.ts` or `.nuxvel/rehearsals.json` does not load.

A variable in the shell wins over `.env`. A connection setting in the `runtimeConfig` of `nuxt.config.ts`, such as `databaseUrl`, counts when no variable sets it, as at boot. The environment row checks it, and the database rows connect with it.

The stored-names and maintenance checks run inside the app, and only when the environment is valid and the app uses `@nuxvel/nuxt`. It finds what a moved or deleted file left behind: queued and failed jobs, undelivered outbox rows, BullMQ schedulers, and flag and experiment state in Redis. See [Renaming a definition](./index.md#renaming-a-definition).

The command prints one row for each check on stderr: `✔` passed, `✖` failed, `▲` warning or `○` skipped. What to do shows under each problem. A summary follows:

```
┌  nuxvel doctor
│  ✔ environment          passes the server's boot checks
│  ✔ database connection  localhost:5432/blog
│  ▲ pending migrations   2 pending migrations
│                         → Run nuxvel db:migrate
│  ✖ stored names         queued job "post.notify" (3) is stored under a name nothing defines
│                         → Keep a renamed() alias at the old path, or remove it
│  ✔ maintenance          the app is up
│  ○ cache redis          skipped, NODE_ENV is not production
│  ○ bot protection       skipped, NODE_ENV is not production
│  ✔ security advisories  no known advisories for the production dependencies
│  ✔ mail dns             blog.example.com has SPF, DKIM (selector default) and DMARC records
│  ○ off-site backups     skipped, no nuxvel.deploy.ts
│  ○ restore rehearsal    skipped, no nuxvel.deploy.ts
│  ○ security headers     skipped, pass --url
│  ○ health endpoints     skipped, pass --url
│  ○ server-sent events   skipped, pass --url
│
└  1 failed, 1 warning, 5 passed, 7 skipped
```

An invalid environment shows the variable and the fix:

```
│  ✖ environment          NUXT_AUTH_SECRET: Too small: expected string to have >=32 characters
│                         → Run nuxvel key:generate to write one of the right strength
```

The command exits `1` when a check fails. A warning alone, such as pending migrations or maintenance mode, exits `0`. `--json` prints the same data as one document on stdout:

```json
{
  "checks": [
    { "name": "pending migrations", "status": "warning",
      "findings": [{ "status": "warning", "detail": "2 pending migrations", "hint": "Run nuxvel db:migrate" }] }
  ],
  "summary": { "failed": 0, "warning": 1, "passed": 6, "skipped": 5 }
}
```

Pass `--url` with the address of a running app to also check three more things:

- **security headers**: the app sends a `Content-Security-Policy` header.
- **health endpoints**: both health probes, `/api/health/live` and `/api/health/ready`, answer.
- **server-sent events**: a stream of the built-in `flags` channel, `/api/channels/flags`, delivers its first event within 5 seconds. A proxy that buffers responses holds the event back, and [realtime](./realtime.md) updates then never arrive.

Use the public URL, so that the checks go through the proxy:

```sh
nuxvel doctor --url http://localhost:3000
```

```
│  ✖ security headers     http://localhost:3000 has no Content-Security-Policy header
│                         → Check the security.headers settings in nuxt.config.ts
│  ✖ health endpoints     http://localhost:3000/api/health/ready returned 503
│                         → /api/health/ready fails while the database or Redis is down
│  ✖ server-sent events   no event from http://localhost:3000/api/channels/flags arrived within 5 s
│                         → A proxy buffers the stream: turn buffering off for /api/channels (proxy_buffering off in nginx)
```

### `nuxvel tinker`

```sh
nuxvel tinker [env] [--force]
```

`nuxvel tinker` opens a REPL inside the Nitro server of the app. With an environment, such as `nuxvel tinker production`, it opens it on the server instead, over SSH as the deploy user, in the live release with `shared/.env`, `shared/owner.env` and the environment of the pm2 processes (`NODE_ENV=production`, and the erasure log command, so `eraseUserData()` writes the erasure log). It asks first, because what you run there changes the live data. `--force` skips the question. Without a terminal, the command refuses unless you pass `--force`. See [Deploying to a VPS](./deploy.md#logs-status-and-a-shell). These are in scope with no imports:

- The schema tables, one by one and as `schema`.
- Every server auto-import that Nitro knows: the [nuxvel ones](./auto-imports.md) such as `useDb()`, `$mails`, `$channels` and `useBucket()`, those of Nitro, h3 and other modules, and the `server/utils` and `shared/` of the app.
- Every export of the files under `server/actions/`.
- Every export of the files under `server/factories/`, such as `postFactory`.
- `trpc`, the in-process caller of the app router that [`useCaller()`](./api.md) returns.

```
nuxvel> const post = await createPostAction({ title: "Hi", body: "There" }, { actor: userActor({ id, role: "user" }) })
nuxvel> await useDb().select().from(postTable)
nuxvel> await postFactory({ title: "Seeded" })
nuxvel> await trpc.post.list()
nuxvel> await $mails.welcome.send({ to: "ada@example.com", name: "Ada" })
```

`trpc` has no session. A procedure behind `authedProcedure` throws `UNAUTHORIZED` there. Call the action with an actor instead.

Outside a transaction, an awaited `$mails.x.send()` or `$jobs.x.dispatch()` has written its outbox row when it returns.

#### Completion

Press Tab to complete a name. Tab completes the tables, the auto-imports, the actions and the factories. After `trpc.`, Tab completes the routers and then their procedures. For example, `trpc.post.withA` and Tab gives `trpc.post.withAuthors`. When more than one name matches, a second Tab lists them.

#### Listing commands

These commands list what the app defines:

| Command | Lists |
| --- | --- |
| `.tables` | Each table of `#nuxvel/schema`, with its SQL name |
| `.routes` | Each tRPC procedure, with its type, then each Nitro route, with its method |
| `.jobs` | The name of each job, the built-in ones included |

```
nuxvel> .tables
postTable         posts
healthChecksTable  health_checks
```

`.help` lists these and the commands of the Node REPL, such as `.editor` for a block of code on more than one line.

#### History and output

The history of each app goes to `.nuxvel/tinker-history`. The Up key recalls a line from an earlier session. The starter ignores `.nuxvel/` in git, except `generated.json`, `templates/`, `known_hosts` and `rehearsals.json`.

A result prints six levels deep, so a row with its relations shows in full. On a terminal the result has colours. Piped output has no colours.

#### Input

The REPL is the REPL of Node (`node:repl`). Top-level `await` and statements on more than one line work. A declaration with `const`, `let`, `function` or `class` stays in scope for the rest of the session. The input is JavaScript, not TypeScript.

Piped input runs one statement at a time, and each statement completes before the next starts. So `nuxvel tinker < script.js` works too. Piped input also goes to the history file. Ctrl-D exits. The command reads `NUXT_DATABASE_URL` from the environment and from `.env`, like the rest of the CLI. It closes the connections of the app when it exits.

### `nuxvel route:list`

```sh
nuxvel route:list [--json] [--diff=<git ref> | --diff-env=<env>]
```

`nuxvel route:list` lists the addresses that the app answers on. It reads them from the loaded app: the procedures of the tRPC router, and every route that Nitro serves. The routes include the `server/api` and `server/routes` files of the app and its layers, and the routes that modules add, such as `/api/health/live` and `/api/auth/**` of nuxvel.

```
METHOD  PATH                   SOURCE
POST    /api/trpc/post.create  server/trpc/routers/post.router.ts
GET     /api/trpc/post.list    server/trpc/routers/post.router.ts
GET     /api/webhooks/stripe   server/api/webhooks/stripe.get.ts
✔ 3 routes, no colliding paths
```

The table goes to stdout and the summary to stderr. A `.query()` procedure shows as `GET` and a `.mutation()` as `POST`, under the namespace that the app serves it on. For example, `routers/admin/index.ts` is `admin.index`. See [API](./api.md). A route file without a method suffix shows as `ALL`. A built-in procedure, such as `apiKeys.create`, shows `@nuxvel/nuxt` as its source.

When two files answer the same request, the command lists them under the table and exits `1`:

```
✖ 12 routes, 1 colliding path
  GET /api/thing  server/api/thing.get.ts, server/api/thing/index.get.ts
  → Keep one file per method and path; parameter names don't make two paths different
```

Other collisions are `server/api/posts/[id].get.ts` next to `server/api/posts/[slug].get.ts`, because parameter names do not make two paths different, and a route without a method suffix next to a `.post.ts` route. A router file and a router folder that share a namespace fail the same way that they fail the build.

`--json` prints `{ "procedures", "routes", "collisions" }`. Each procedure has `name`, `type`, `method`, `path` and `source`, and the JSON Schemas of its `input` and `output` (`null` without one). Each route has `method`, `path` and `source`. Each collision has `method`, `path` and `sources`.

```sh
nuxvel route:list --diff=<git ref> [--json]
```

`--diff` compares the tRPC procedures with the app at a git ref, for example the live release's tag, and exits `1` on a breaking change. It reads the app's files at that ref with `git archive`, loads that app with the current `node_modules`, and compares the two lists:

```
✖ 2 breaking API changes since v1.4.0
  post.list: removed or renamed
  post.byId: input field "locale" is now required
  → Keep the old shape for one release, then remove it in the next
```

These changes are breaking, because a browser tab from the old build still sends the old calls:

- A procedure that is removed or renamed.
- An input field that is removed.
- An input field that is new and required, or that was optional and is now required.
- An output field that is removed. Only a procedure with an `.output()` schema has output fields to compare.

Nested fields show with dots, for example `author.name`. With no breaking change, the command prints `✔ No breaking API changes since <ref>` and exits `0`. `--json` prints `{ "breaking": [...] }`.

```sh
nuxvel route:list --diff-env=<env> [--json]
```

`--diff-env` compares with the live release of an environment in `nuxvel.deploy.ts` instead of a git ref. It reads the release's `nuxvel-routes.json`, which the [build](./build.md#archives) puts in the archive, over SSH as the deploy user. It fails when the live release has no `nuxvel-routes.json`. The hint gives the routes step to add to the build stage of the Dockerfile. When nothing is live yet, it prints `<app> has no live release on <host>, so no call can break` and passes. See [API: calls from an older build](./api.md#calls-from-an-older-build).

### `nuxvel channel:list`

```sh
nuxvel channel:list [--json]
```

`nuxvel channel:list` lists the realtime channels of the loaded app. The list has each channel under `server/channels/`, the built-in `flags` channel, and the `job:<name>` channel of each job with a `channel` option.

```
NAME            GUESTS   REPLAY BUFFER  SERVERS LISTENING
flags           allowed  0 of 500       2
job:post.import refused  3 of 500       0
posts           refused  42 of 500      2
```

- `GUESTS` is `allowed` when `authorize` accepts a guest, that is, `{ user: null }`. An `authorize` that throws for a guest shows `refused`.
- `REPLAY BUFFER` is the number of events that Redis keeps for [catching up](./realtime.md#catching-up-after-a-reconnect), out of the 500 that it can keep.
- `SERVERS LISTENING` is the number of server processes that listen to the channel in Redis now. A server listens while at least one of its connections follows the channel. This is not the number of browsers.

`--json` prints `{ "channels": [{ "name", "guests", "buffered", "replayLimit", "listeningServers" }] }`.

### `nuxvel openapi:export [file]`

```sh
nuxvel openapi:export openapi.json
# ✔ Wrote the OpenAPI document to /home/me/blog/openapi.json
nuxvel openapi:export > openapi.json
```

`nuxvel openapi:export` writes the OpenAPI document of the loaded app to `file`. It is the document that `<restPrefix>/openapi.json` serves. Without `file`, it prints the document to stdout. When `nuxvel.api.openapi` is not set, the command exits `1`. See [REST and OpenAPI](./openapi.md#the-openapi-document).

## Database

### `nuxvel db:generate`

```sh
nuxvel db:generate [name] [drizzle-kit arguments]
```

`nuxvel db:generate` generates a Drizzle migration from your schema. It runs `drizzle-kit generate` with the `drizzle.config.ts` of the app. The first argument, if it is not an option, is the name of the migration (`--name` of drizzle-kit). Other arguments go to drizzle-kit.

```sh
nuxvel db:generate
nuxvel db:generate add-post-slug
```

Then it moves the breaking statements of the new migration into `migrations/contract/<name>.sql`, a [contract migration](./database.md#contract-migrations): drops, renames, type changes, `SET NOT NULL` and every statement it does not know. It does not move the drop of a constraint or an index that the same migration creates again with the same name. It lists each one it moved:

```
▲ Moved 1 breaking statement to contract/0026_posts-drop-summary.sql
  → A deploy runs it once no older release runs. A rename or a type change breaks the new release until then: add a column and backfill it instead
    ALTER TABLE "posts" DROP COLUMN "summary"
```

It also moves each `CREATE INDEX` on a table that the migration does not create into a migration of its own. That migration builds the index with `CREATE INDEX CONCURRENTLY`, outside a transaction, so the app can write to the table while the index builds. See [Indexes on existing tables](./database.md#indexes-on-existing-tables):

```
▲ Moved 1 index on an existing table to 0027_posts-search-index
  → Each one builds with CREATE INDEX CONCURRENTLY, outside a transaction, so the writes to the table go on while it builds
```

### `nuxvel db:migrate`

```sh
nuxvel db:migrate
```

`nuxvel db:migrate` applies the pending migrations in `server/database/migrations`. It connects as `NUXT_DATABASE_OWNER_URL`, or as `NUXT_DATABASE_URL` when the owner URL is not set. It reads them from the shell or from the `.env` of the app. It records each migration in `drizzle.__drizzle_migrations`. Then it applies the [contract migrations](./database.md#contract-migrations) in `migrations/contract/` and records them in `drizzle.__nuxvel_contract_migrations`; one that waits on a backfill is listed as deferred.

```
┌  nuxvel db:migrate
◇  Connected as NUXT_DATABASE_OWNER_URL (localhost:5432/blog)
◇  Applied 2 migrations (0.4s)
│    0007_add_post_slug
│    0008_audit_partitions
◇  Audit log partitions: created 0, dropped 0
└  Database is up to date
```

The command skips migrations that are already applied. With nothing pending and no deferred contract migration, it ends with `Already up to date`. When a migration fails, the command prints the error of the database and exits `1`. Each migration runs in its own transaction: the failed one is not applied, the ones before it are.

A contract migration that waits on a backfill stays deferred. Each run lists it again, also when nothing is pending:

```
◇  No pending migrations
▲ Deferred 1 migration waiting on a backfill
  → Run the backfill to completion, then run nuxvel db:migrate again
│    contract/0102_widgets-title
◇  Audit log partitions: created 0, dropped 0
└  Database is up to date
```

The command applies the contract migrations at once, while an older release can still read what they remove. So do not run it against a production database. [`nuxvel deploy`](./deploy.md) runs the migrations of a release, and applies its contract migrations only when no older release runs.

After the migrations, also when nothing is pending, the command creates the missing monthly partitions of the audit log. It drops old partitions only when `nuxvel.audit.retentionMonths` is set. See [Audit log](./audit.md#partitions-in-development).

A migration waits at most 5 seconds for a lock, because the command sets `lock_timeout` to 5000 milliseconds. So a migration that needs a table that a long query holds does not block every other query on that table. After a lock timeout, the command rolls that migration back and tries it again, up to 3 times:

```
┌  nuxvel db:migrate
│
◇  Connected as NUXT_DATABASE_URL (localhost:5432/blog)
✖ Timed out waiting for a lock, retry 1 of 3 (5.0s)
✖ Timed out waiting for a lock, retry 2 of 3 (5.0s)
✖ Timed out waiting for a lock, retry 3 of 3 (5.0s)
✖ Could not apply the migrations (5.0s)
✖ canceling statement due to lock timeout
  → Another session holds a lock that a migration needs. Wait for it to end, then run nuxvel db:migrate again
```

To use a different timeout, add `lock_timeout` to the query of the database URL, for example `postgres://app:secret@db:5432/app?lock_timeout=30s`.

When a migration file changed after it ran, or the journal does not have a migration that ran, the command applies nothing and exits `1`:

```
┌  nuxvel db:migrate
│
◇  Connected as NUXT_DATABASE_URL (localhost:5432/blog)
✖ 0016_webhook-endpoints changed after it ran on this database
  → Restore the file and put the change in a new migration, or rebuild a dev database with nuxvel db:fresh
```

A different `out` folder, or `migrations: { table, schema }`, in `drizzle.config.ts` replaces the defaults. `doctor` and `build:manifest` use the same settings.

### `nuxvel db:seed [name...]`

```sh
nuxvel db:seed
nuxvel db:seed blog.posts tags
nuxvel db:seed --volume
```

`nuxvel db:seed` runs the seeders under `server/seeders/`, inside the app. With no name, it runs every seeder. With names, it runs only those seeders, in the given order. A seeder runs one time in each run, also when other seeders call it with `call()`. See [Seeding](./database.md#seeding).

```
# nuxvel db:seed database, where database calls tags and blog.posts
✔ Seeded tags
✔ Seeded blog.posts
✔ Seeded database
```

The command prints one line on stderr for each seeder after its transaction commits. What a seeder prints with `console.log` goes to stdout.

`--volume` fills each table of the schema with 1000 generated rows with drizzle-seed instead of running the seeders. It connects as `NUXT_DATABASE_URL` from the shell or `.env`, and does not load the app. It skips the tables of nuxvel, the tables with a `tsvector` column and the tables that reference a skipped one, and lists them. It starts integer IDs above the largest one in each table and moves the sequences past them. See [Database: volume data](./database.md#volume-data).

An unknown name exits `1` and writes nothing. When a seeder throws, the command prints the error and exits `1`. The transaction of that seeder rolls back. The seeders that finished before it stay in the database.

When `NODE_ENV` is `production`, the command refuses to run and exits `1`. Pass `--force` to seed that database anyway:

```
✖ Refusing to seed: NODE_ENV is production
  → Pass --force to seed this database anyway
```

### `nuxvel db:fresh`

```sh
nuxvel db:fresh
nuxvel db:fresh --seed --force
```

`nuxvel db:fresh` gives you a new development database. It drops every table and enum type in the `public` schema, and the migrations table. Then it applies every migration, as `nuxvel db:migrate` does. It runs no seeder. Pass `--seed` to also run every seeder, as `nuxvel db:seed` does. It connects as `NUXT_DATABASE_OWNER_URL`, or as `NUXT_DATABASE_URL` when the owner URL is not set.

```
┌  nuxvel db:fresh
◇  Dropped 14 tables in localhost:5432/blog
└  Database is empty
┌  nuxvel db:migrate
◇  Connected as NUXT_DATABASE_URL (localhost:5432/blog)
◇  Applied 3 migrations (0.3s)
└  Database is up to date
```

The command asks before it drops the tables. Pass `--force` to skip the question. Outside a terminal, or in CI, the command cannot ask. Then it exits `1` unless you pass `--force`.

When `NODE_ENV` is `production`, the command always refuses to run and exits `1`. `--force` does not change this.

### `nuxvel db:check`

```sh
nuxvel db:check [--baseline]
```

`nuxvel db:check` reads the tables in the `schema` files of `drizzle.config.ts`, or in `server/database/schema/` when the app has no `drizzle.config.ts`. It fails when a foreign key has no index that starts with its columns. A primary key or a unique constraint on those columns also counts. A partial index does not count. The command needs no database, so you can run it in CI.

```
✖ Foreign key post.author_id has no index that starts with its columns
✖ 1 foreign key without an index
  → Add an index on the columns in the table's schema file, or list the key in nuxvel.database.unindexedForeignKeys with a reason
```

To accept a foreign key without an index, list it in `nuxvel.database.unindexedForeignKeys` of `nuxt.config.ts`, with the reason. An empty reason does not count. See [Database: foreign key indexes](./database.md#foreign-key-indexes). When every foreign key has an index, the command prints `✔ Every foreign key has an index` and exits `0`.

It also reads the migrations, and fails on a statement that is not safe while the live release runs:

- a breaking statement (a drop, a rename, a type change, `SET NOT NULL`, or one it does not know) outside `contract/`. Move it to a [contract migration](./database.md#contract-migrations). The drop of a constraint or an index that the same migration creates again with the same name is not breaking.
- `CREATE INDEX` without `CONCURRENTLY` on a table the migration does not create. See [Indexes on existing tables](./database.md#indexes-on-existing-tables).
- `CREATE INDEX CONCURRENTLY` in a migration without the `-- nuxvel:no-transaction` line.
- a migration with the `-- nuxvel:no-transaction` line and more than one statement. The migrator applies only one statement outside a transaction.

It also fails on a migration with an earlier time in `meta/_journal.json` than a migration before it, or with the same number as one before it. Two branches that each generated a migration make both. A database that applied the other migration skips this one. See [Migrations from two branches](./database.md#migrations-from-two-branches). This check reads every migration, also the ones before the baseline.

```
0026_posts-title-index:
✖ CREATE INDEX blocks the writes to posts while it builds: CREATE INDEX "posts_title_idx" ON "posts" USING btree ("title")
  → Build it with CREATE INDEX CONCURRENTLY, alone in a migration whose first line is -- nuxvel:no-transaction (nuxvel db:generate --custom)
✖ 1 unsafe migration statement
```

It checks only the migrations after the baseline in `migrations/meta/_nuxvel.json`. A new app ships one. In an app that has migrations from before, run `nuxvel db:check --baseline` once: it accepts every current migration, and later runs check only the new ones. When all is well, the command also prints `✔ Every migration is in order` and `✔ Every migration is safe to deploy`.

### `nuxvel db:rollback`

```sh
nuxvel db:rollback
```

`nuxvel db:rollback` undoes the last applied migration. Drizzle does not write down migrations, so you write one by hand. Put it in the `down/` folder of the migrations folder, with the name of the migration:

```sql
-- server/database/migrations/down/0008_add_post_summary.sql
ALTER TABLE "post" DROP COLUMN "summary";
```

The command runs that file and removes the migration from the migrations table, in one transaction. The next `nuxvel db:migrate` applies the migration again. It connects as `NUXT_DATABASE_OWNER_URL`, or as `NUXT_DATABASE_URL` when the owner URL is not set.

```
┌  nuxvel db:rollback
◇  Connected as NUXT_DATABASE_URL (localhost:5432/blog)
◇  Rolled back 0008_add_post_summary
└  Run nuxvel db:migrate to apply it again
```

When the last migration has no down migration, the command changes nothing, warns and exits `1`:

```
▲ No down migration for 0008_add_post_summary
  → Write the SQL that undoes it in server/database/migrations/down/0008_add_post_summary.sql, then run nuxvel db:rollback again
```

When `NODE_ENV` is `production`, the command refuses to run and exits `1`. Pass `--force` to roll that database back anyway.

### `nuxvel db:studio`

```sh
nuxvel db:studio [drizzle-kit arguments]
```

`nuxvel db:studio` opens Drizzle Studio on the schema of the app. It runs `drizzle-kit studio` with the `drizzle.config.ts` of the app and connects to `NUXT_DATABASE_URL`. It reads the URL from the shell or from the `.env` of the app. Other arguments go to drizzle-kit.

```sh
nuxvel db:studio
nuxvel db:studio --port 5000
```

When `drizzle.config.ts` sets `dbCredentials`, Drizzle Studio uses them in place of `NUXT_DATABASE_URL`. When `NUXT_DATABASE_URL` is not set, the command exits `1`.

## Generators

```sh
nuxvel make:job post.notify-subscribers
# ✔ Created server/jobs/post/notify-subscribers.job.ts
# ✔ Created server/jobs/post/notify-subscribers.job.test.ts
# ◇ Updated types (nuxt prepare) (2.8s)
```

The `make:*` commands write new files where the app keeps its code. In this section, `server/` means the `serverDir` of the app from `nuxt.config.ts`, and `shared/` means its `dir.shared`. A generated test finds the app root from its own location, so a custom `serverDir` needs no change. The introspection commands (`route:list`, `event:list`, `test:arch`) read every layer that the app extends, as the module discovers them.

A generator lists each file that it wrote on stdout. Then it runs `nuxt prepare`, so the types of the new auto-imports are ready with no restart. When `nuxt prepare` fails, for example because of a broken `nuxt.config.ts`, the files stay written. The command prints the full output of `nuxt prepare` and exits `1`. `make:test`, `make:loadtest`, `make:page` and `make:story` do not run `nuxt prepare`.

When `nuxvel dev` runs in another terminal, a generator does not run `nuxt prepare`. It prints `○ Types update in the running nuxt dev (nuxt prepare skipped)`, and the dev server updates the types itself. A generator finds the dev server from the `nuxt.lock` file that Nuxt writes in `.nuxt`. `nuxvel dev` sets `NUXT_LOCK=1`, so Nuxt always writes this file.

A generated file imports tables from `#nuxvel/schema`, factories from `#nuxvel/factories`, other server code from `#server/<path>` and shared code from `#shared/<path>`. It imports a file of the same folder, and a table or factory of its own kind (a schema file imports another schema file, a factory another factory), by a relative path. Most generators also write a functional test next to the file. The test passes with no change and typechecks. It imports its fixtures from `@nuxvel/nuxt/testing` and writes no files into the app.

### Names

A name for a `make:*` command is kebab-case: lowercase letters, digits and single dashes, and it starts with a letter. Use `blog-post`, not `blogPost` or `blog_post`. Some commands take more than one word:

| Command | Name format | Example |
| --- | --- | --- |
| `make:action` | `<domain>/<name>`, with exactly one `/` | `posts/archive-post` |
| `make:job`, `make:event`, `make:listener`, `make:mail`, `make:notification`, `make:webhook`, `make:channel`, `make:backfill`, `make:flag`, `make:experiment`, `make:schedule`, `make:seeder` | The name of the definition: words joined by `.`, each dot a folder | `post.notify-subscribers` |
| `make:test` | The path of the target under `server/`, without extension | `actions/posts/create-post` |
| All other `make:*` | One word | `blog-post` |

`make:action` and the commands that take the name of a definition accept `.` or `/` between the words, and a word in kebab-case or camelCase. `post.hello-world`, `post/hello-world` and `post/helloWorld` all write `server/jobs/post/hello-world.job.ts` for `make:job`, and the job name is `post.hello-world`.

Each `make:*` command for a discovered definition adds the kind to the file name (`.action.ts`, `.job.ts`, `.policy.ts`, `.factory.ts`, `.router.ts`, `.seeder.ts`, `.backfill.ts`, `.flag.ts`, `.experiment.ts`, `.schedule.ts`, `.webhook.ts`, ...). The file exports the definition under the camelCase of the full name with the kind at the end: `make:job post.notify-subscribers` writes `server/jobs/post/notify-subscribers.job.ts`, which exports `postNotifySubscribersJob`, and `make:policy blog-post` exports `blogPostPolicy`. An action is different: its export uses only the file name, so `make:action posts/create-post` exports `createPostAction`. `make:schema` writes `<name>.schema.ts`. Discovery removes the kind from the name, so the job name stays `post.notify-subscribers`. We recommend a verb and a subject for the name of an action, a job or a listener, for example `notify-subscribers`. Nothing enforces this.

`make:action`, `make:job`, `make:event`, `make:listener`, `make:mail`, `make:notification`, `make:channel`, `make:backfill`, `make:flag`, `make:experiment` and `make:schedule` take `--domain <domain>`. The command then writes the file under `server/domains/<domain>/<kind folder>/`, and the name of the definition starts with the domain. `make:job notify-courier --domain parcel` writes `server/domains/parcel/jobs/notify-courier.job.ts`, which exports `parcelNotifyCourierJob`. The job name is `parcel.notify-courier`, the same name as `make:job parcel.notify-courier` gives. For `make:action`, give the name without the domain: `make:action cancel-parcel --domain parcel` writes `server/domains/parcel/actions/cancel-parcel.action.ts`. The domain is one kebab-case word. `make:schema`, `make:factory`, `make:policy`, `make:router` and `make:resource` also take `--domain <domain>`. They write the file under the kind folder of the domain, and the imports between the files point into the domain folder. `make:schema courier --domain parcel` writes `server/domains/parcel/schema/courier.schema.ts`. Then `make:factory courier --domain parcel` writes `server/domains/parcel/factories/courier.factory.ts` and its test. A policy or router file with the name of its domain is the domain itself: `make:policy depot --domain depot` writes `server/domains/depot/policies/depot.policy.ts`, which exports `depotPolicy`. Such a file must be the only file of its kind in the domain, because the domain name cannot be a definition and a folder of definitions at the same time. `make:router crate --crud --domain parcel` writes the schema, the policy, the actions and the router `routers/crate.router.ts` into the domain folder. The router exports `parcelCrateRouter` and is the tRPC namespace `parcel.crate`. `make:resource crate --domain parcel` writes the same files, and the privacy file `server/privacy/crate.user-data.ts` imports the table from the domain folder. `make:backfill --domain parcel --table crate` reads the table from `server/domains/parcel/schema/`. See [Domain folders](./auto-imports.md#domain-folders).

Each `make:*` command except `make:module` and `make:loadtest` takes `--module <name>`. The command then writes the files into the module `layers/<name>/` instead of the app. `--module` works together with `--domain`: `make:job charge-card --module billing --domain invoice` writes `layers/billing/server/domains/invoice/jobs/charge-card.job.ts`. The `make:page` and `make:resource --ui` commands write pages to `layers/<name>/app/pages/` and components to `layers/<name>/app/components/`. The imports of the `auth` and `backfills` tables point to the schema of the app. Run the command from the app root. The module must exist first. See [`nuxvel make:module`](#nuxvel-makemodule-name).

Some commands need a file that already exists:

| Command | Needs |
| --- | --- |
| `make:factory <table>`, `make:backfill --table <table>` | `server/database/schema/<table>.schema.ts`, or `<table>.ts` |
| `make:listener --event <event>` | The file of the event: `<event>.event.ts` under `server/events/`, or in the domain folder of the first word of the event name. The command looks in the app and in every module, also with `--module`, so a listener of a module can name an event of the app or of another module |
| `make:test <path>` | `server/<path>.ts` |
| `make:story <path>` | `app/components/<path>.vue` |

When a name is malformed or a target is missing, the command says what to do, writes nothing and exits `1`:

```
✖ server/database/schema/gadgets.schema.ts does not exist
  → Create it first: nuxvel make:schema gadgets
```

### Existing files

A `make:*` command does not overwrite a file that already exists. This includes a file whose name differs only in case. The command names the files in the way, writes nothing and exits `1`. Pass `--force` to overwrite them.

```sh
nuxvel make:task reindex-posts
# ✖ Refusing to overwrite server/tasks/reindex-posts.ts
#   → Pass --force to overwrite
nuxvel make:task reindex-posts --force
```

### Fields

```sh
nuxvel make:schema task title notes:text:nullable status:enum=open,done:default=open project:references
```

`make:schema`, `make:router --crud` and `make:resource` take fields after the name. Write each field as `name[:type[=arg]][:modifier...]`. The characters are safe in zsh and bash without quotes. The type is `string` if you do not write it. Each field becomes a Drizzle column and a Zod field.

| Type | Drizzle column | Zod field |
| --- | --- | --- |
| `string` | `varchar(255)` | `z.string().trim().min(1).max(255)` |
| `text` | `text` | `z.string().trim().min(1)` |
| `email` | `varchar(255)` | `z.email().max(255)` |
| `integer` | `integer` | `z.number().int()` |
| `bigint` | `bigint` (a JavaScript number) | `z.number().int()` |
| `boolean` | `boolean` | `z.boolean()` |
| `decimal[=p,s]` | `numeric(p, s)`, `10, 2` if you do not write them | a decimal string |
| `uuid` | `uuid` | `z.uuid()` |
| `date` | `date` (a `YYYY-MM-DD` string) | `z.iso.date()` |
| `timestamp` | `timestamp` (a `Date`) | `z.date()` |
| `json` | `jsonb` | `z.json()` |
| `enum=a,b` | `text` with these values | `z.enum(["a", "b"])` |
| `references[=table]` | the id type of the table, with a foreign key and an index | the id type |

| Modifier | Effect |
| --- | --- |
| `nullable` | The column accepts `NULL`, and the Zod field accepts `null` and no value. Without it, the column is `NOT NULL`. |
| `unique` | Adds a unique constraint. The constraint has its own index, so `unique` with `index` or `references` adds no second index. |
| `index` | Adds an index, `<table>_<column>_idx`. |
| `default=<value>` | Sets the default of the column. The Zod field is optional. When the input has no value, the database writes the default. The types `uuid`, `date`, `timestamp`, `json` and `references` take no default. |

The Zod row schema does not list `searchVector`, so the search column does not reach the browser.

A field name is camelCase or snake_case. The column is snake_case, and the key in the table and the Zod input is camelCase: `due_on` and `dueOn` both give the column `due_on` and the key `dueOn`.

`project:references` adds the column `projectId: belongsTo(projectTable)`, named `project_id`. It points at `projectTable.id` in `project.schema.ts`, with the same type as that id. See [`belongsTo()`](./database.md#foreign-keys-with-belongsto). Give the table after `=` when it has a different name: `reviewer:references=user` points at `userTable` in the auth schema. The foreign key deletes the row when the target row is deleted (`onDelete: "cascade"`). With `nullable`, it sets the column to `NULL` (`belongsTo(projectTable, { nullable: true, onDelete: "set null" })`). Each reference gets an index, unless it has `unique`: the unique constraint already has an index. The target table must exist. The command looks for it in the same domain, in `server/database/schema/`, and then in every other domain folder and every module. It stops with an error when two tables have the name:

```sh
nuxvel make:schema comment post:references
# ✖ The table post does not exist
#   → Create it first: nuxvel make:schema post
```

The command fails and writes nothing for an unknown type or modifier, for a name that occurs two times, and for these reserved names: `id`, `createdAt`, `updatedAt`, `deletedAt`, `ownerId`, `searchVector`. There is no command that adds a column to a table that exists. Edit the table file, then run `nuxvel db:generate`.

`make:job`, `make:event` and `make:action` also take fields. They write only the Zod input, and their generated test sends a sample value for each field:

```sh
nuxvel make:job post.notify title count:integer:default=1 sent_at:timestamp
```

```ts
export const postNotifyJob = defineJob({
  input: z.object({
    title: z.string().trim().min(1).max(255),
    count: z.number().int().default(1),
    sentAt: z.iso.datetime(),
  }),
  handler: async (input) => {
    console.log("post.notify", input);
  },
});
```

These commands have no table, so they differ from `make:schema`:

- `default=<value>` becomes `.default(<value>)` in the Zod field.
- In a job and an event, a `timestamp` is an ISO string (`z.iso.datetime()`), because the payload goes through JSON on the queue. In an action, it is a `Date`.
- The type `references` and the modifiers `unique` and `index` stop the command with an error.

When you give no fields in a terminal, these commands ask for the fields one at a time. `make:router` asks only with `--crud`. Enter one field for each question. Enter nothing to stop. When a field is not correct, the command shows the error and asks again:

```sh
nuxvel make:schema task
# ◇  Field 1 as name[:type[=arg]][:modifier...]. Enter nothing to stop.
# │  title
# ▲  Field 2 as name[:type[=arg]][:modifier...]. Enter nothing to stop.
# │  notes:txt
# └  "notes:txt": "txt" is not a known type. Use one of: string, text, ...
```

Outside a terminal, the commands do not ask. Without fields, they write a table or an input with no fields.

### `nuxvel make:page <path>`

```sh
nuxvel make:page blog/index
```

`nuxvel make:page` writes a Nuxt page component to the pages directory of the app. In the starter, that is `app/pages/<path>.vue`. The file is the same page that `nuxt add page` writes. Pass `--force` to overwrite a page that exists. The path is used as given, so `nuxvel make:page "(app)/billing"` writes a page into the `(app)` [route group](./frontend.md#route-groups).

### `nuxvel make:story <path>`

```sh
nuxvel make:story base/Button
# ✔ Created app/components/base/Button.stories.ts
```

`nuxvel make:story` writes a [Storybook](./storybook.md) story next to a component. The path is the path of the component under `app/components/`, without `.vue`. It is the file path, not the name that Nuxt gives the component: Nuxt calls `app/components/base/Button.vue` `BaseButton`, but you pass `base/Button`. The component must exist. The story imports the component by its relative path and has one story, `Default`, with a `play` function that checks that the component rendered something. Pass `--force` to overwrite a story that exists.

### `nuxvel make:module <name>`

```sh
nuxvel make:module billing
# ✔ Created layers/billing/nuxt.config.ts
```

`nuxvel make:module` writes `layers/<name>/nuxt.config.ts` with an empty `defineNuxtConfig({})`. Nuxt extends the new layer automatically. The command writes no other file. See [Modules](./modules.md).

### `nuxvel make:schema <name>`

```sh
nuxvel make:schema blog-post
nuxvel make:schema blog-post title body:text published_at:timestamp:nullable
```

`nuxvel make:schema` writes a Drizzle table file at `server/database/schema/<name>.schema.ts`, with `id`, `...timestamps()` and the row types. The table export gets the `Table` suffix (`blogPostTable`), and the row types get the `Row` suffix (`BlogPostRow`, `NewBlogPostRow`). It also writes the Zod schemas at `shared/schemas/<name>.ts`: `blogPostIdInput` (`{ id }`), `createBlogPostInput`, `updateBlogPostInput` and `blogPostSchema`. `updateBlogPostInput` is `createBlogPostInput` with every field optional, plus `id`. `blogPostSchema` is the full row, with the type `BlogPostRow` and no input rules. The names follow [Validation](./validation.md#naming).

```ts
// server/database/schema/blog-post.schema.ts
import { pgTable, serial } from "drizzle-orm/pg-core";
import { timestamps } from "@nuxvel/nuxt/database";

export const blogPostTable = pgTable("blog_post", {
  id: serial("id").primaryKey(),
  ...timestamps(),
});

export type BlogPostRow = typeof blogPostTable.$inferSelect;
export type NewBlogPostRow = typeof blogPostTable.$inferInsert;
```

Without fields, the generator writes only the shape that every table needs. With fields, it adds a column to the table and a field to `createBlogPostInput` for each field. See [Fields](#fields). Then run `nuxvel db:generate` to write the migration.

```sh
nuxvel make:schema blog-post --soft-deletes
```

Pass `--soft-deletes` to also add `...softDeletes()` to the table. See [Soft deletes](./soft-deletes.md).

```sh
nuxvel make:schema blog-post --searchable title,body
```

Pass `--searchable` with a comma-separated list of column names in snake_case. The generator adds a `text` column for each name, and makes the columns searchable with `searchable()` and `searchIndex()`. It also adds a `z.string().trim().min(1)` field for each column to `createBlogPostInput`. See [Full-text search](./search.md).

### `nuxvel make:policy <name>`

```sh
nuxvel make:policy blog-post
```

`nuxvel make:policy` writes a `definePolicy` skeleton at `server/policies/<name>.policy.ts`. The policy imports the matching table from `server/database/schema/<name>.schema.ts`, or from `<name>.ts` when that file exists. nuxvel discovers policies. See [Authorization](./authorization.md).

```ts
// server/policies/blog-post.policy.ts
import { blogPostTable } from "#nuxvel/schema";

export const blogPostPolicy = definePolicy(blogPostTable, {});
```

An empty rules object denies every action. Add the rules yourself, for example `update: (actor, row) => row.authorId === actor.id`.

### `nuxvel make:action <domain/name>`

```sh
nuxvel make:action posts/archive-post
```

`nuxvel make:action` writes an action skeleton at `server/actions/<domain>/<name>.action.ts`. It also writes a functional test at `server/actions/<domain>/<name>.action.test.ts`, which calls the action in the app with `runAction` from `@nuxvel/nuxt/testing`. Give [fields](#fields) after the name to write them into the `input` schema, for example `nuxvel make:action posts/archive-post reason:text`.

```ts
// server/actions/posts/archive-post.action.ts
export const archivePostAction = defineAction({
  handler: async () => {},
});
```

Fill in the input schema and the handler yourself. See [Actions](./actions.md).

### `nuxvel make:router <name> [--crud]`

```sh
nuxvel make:router blog-post
nuxvel make:router blog-post --crud
```

`nuxvel make:router` writes a thin tRPC router skeleton at `server/trpc/routers/<name>.router.ts`:

```ts
// server/trpc/routers/blog-post.router.ts
export const blogPostRouter = {};
```

With `--crud`, it also writes what `make:schema` and `make:policy` write, and three actions: `create-<name>.action.ts`, `update-<name>.action.ts` and `delete-<name>.action.ts`. The table gets an `ownerId: belongsTo(userTable)` column, and an index on that column, `<table>_owner_id_idx`. Postgres does not index a foreign key column for you. These actions have no test file. The delete action removes the row from the table. The policy lets the owner or an admin update and delete a row. The router then connects `list` and `byId` queries and `create`, `update` and `delete` mutations to the actions and the policy. This sample leaves out the `.openapi()` of each procedure, as `--no-openapi` does:

```ts
// server/trpc/routers/blog-post.router.ts
export const blogPostRouter = {
  list: authedProcedure
    .input(blogPostListInput)
    .output(paginated(blogPostSchema))
    .query(({ input, ctx }) =>
      paginate(
        useDb()
          .select()
          .from(blogPostTable)
          .where(and(eq(blogPostTable.ownerId, ctx.user.id), listWhere(blogPostTable, input.filters)))
          .orderBy(...listOrderBy(blogPostTable, input.sort), desc(blogPostTable.id))
          .$dynamic(),
        input,
      ),
    ),
  byId: authedProcedure
    .input(blogPostIdInput)
    .output(blogPostSchema)
    .query(({ input, ctx }) =>
      useDb()
        .select()
        .from(blogPostTable)
        .where(and(eq(blogPostTable.id, input.id), eq(blogPostTable.ownerId, ctx.user.id)))
        .then(firstOrFail),
    ),
  create: authedProcedure
    .input(createBlogPostInput)
    .output(blogPostSchema)
    .mutation(async ({ input }) => {
      const row = await createBlogPostAction(input);
      flash("Blog post created");
      return row;
    }),
  update: authedProcedure
    .input(updateBlogPostInput)
    .output(blogPostSchema)
    .mutation(async ({ input }) => {
      const row = await updateBlogPostAction(input);
      flash("Blog post saved");
      return row;
    }),
  delete: authedProcedure
    .input(blogPostIdInput)
    .output(blogPostIdInput)
    .mutation(async ({ input }) => {
      const row = await deleteBlogPostAction(input);
      flash("Blog post deleted");
      return row;
    }),
};
```

The file also imports the actions, the table, the Zod schemas, `and`, `desc` and `eq`. `list` and `byId` return only the rows of the signed-in user. See [Authorization: scoping reads](./authorization.md#scoping-reads). Each procedure has an `.output()` schema, see below. `list` returns one page of rows, newest first, as [`paginate()`](./database.md#pagination) does. Each mutation sets a [flash message](./frontend.md#flash-messages) for the next page. Give the fields to the command (see below), or add them yourself. Add other procedures and relations yourself. See [API](./api.md).

With `--crud`, the command also writes a test at `server/trpc/routers/<name>.router.test.ts`. The test inserts rows with a factory and checks that `list` runs the same number of queries for 1 row and for 4 rows:

```ts
it("lists in a constant number of queries", async () => {
  const owner = await userFactory();

  await expectConstantQueries(async (size) => {
    for (let row = 0; row < size; row++) await blogPostFactory({ ownerId: owner.id });
    await actingAs(owner).api.blogPost.list();
  });
});
```

When you add a relation to `list`, this test fails if the relation runs a query for each row. See [Testing: query counts](./testing.md#query-counts).

`--crud` also writes `server/privacy/<name>.user-data.ts`, with `defineUserData(blogPostTable, blogPostTable.ownerId)`. The table has an `ownerId` column that references the user table, so `nuxvel user:export` and `nuxvel user:erase` must know it, and `nuxvel test:arch` fails without it. The file is the same with `--domain`. See [Privacy](./privacy.md#declaring-user-data).

These flags change what `--crud` writes. `--soft-deletes` and `--searchable` need `--crud`:

| Flag | Effect |
| --- | --- |
| `--soft-deletes` | Adds `...softDeletes()` to the table. The delete action trashes the row with `softDelete()` and keeps it. Adds a `restore-<name>` action, a `restore` mutation and a `restore` rule to the policy. `list` leaves out trashed rows with `notTrashed()`. See [Soft deletes](./soft-deletes.md). |
| `--searchable <columns>` | Adds a `text` column for each name, as `make:schema --searchable` does. `list` matches the search text `q` with `search()` and orders by `searchRank()`. The update action saves the fields. See [Full-text search](./search.md). |
| `--no-openapi` | Leaves out the `.openapi()` of each procedure. The `.output()` schemas stay. Without this flag, every procedure is a REST endpoint (see below). See [REST and OpenAPI](./openapi.md). |

```sh
nuxvel make:router blog-post --crud --soft-deletes --searchable title,body
```

Each procedure gets an `.output()` schema, with or without `--no-openapi`. The schema removes every field that it does not list, so a column that you add to the table later does not reach the browser until you add it to `blogPostSchema`. A one-line comment above `blogPostSchema` in `shared/schemas/blog-post.ts` says this. Remove from the schema each column that a caller must not see, for example a token.

By default, each procedure also gets `.openapi()` and answers as a REST endpoint under `api.restPrefix`:

| Procedure | REST endpoint | Output |
| --- | --- | --- |
| `list` | `GET /blog-post` | `paginated(blogPostSchema)` |
| `byId` | `GET /blog-post/{id}` | `blogPostSchema` |
| `create` | `POST /blog-post` | `blogPostSchema` |
| `update` | `PATCH /blog-post/{id}` | `blogPostSchema` |
| `delete` | `DELETE /blog-post/{id}` | `blogPostIdInput` |
| `restore`, with `--soft-deletes` | `POST /blog-post/{id}/restore` | `blogPostSchema` |

Every procedure needs a session or an [API key](./openapi.md#api-keys). With `--domain`, the path starts with the domain: `make:router crate --crud --domain parcel` gives `/parcel/crate`. The app serves the [OpenAPI document](./openapi.md#the-openapi-document) only when `nuxvel.api.openapi` is set.

```ts
// server/trpc/routers/blog-post.router.ts, the list procedure
list: authedProcedure
  .openapi({ path: "/blog-post", summary: "List blog post rows", tags: ["blog-post"] })
  .input(blogPostListInput)
  .output(paginated(blogPostSchema))
  .query(({ input, ctx }) =>
    paginate(
      useDb()
        .select()
        .from(blogPostTable)
        .where(and(eq(blogPostTable.ownerId, ctx.user.id), listWhere(blogPostTable, input.filters), search(blogPostTable, input.q ?? ""), notTrashed(blogPostTable)))
        .orderBy(...listOrderBy(blogPostTable, input.sort), desc(searchRank(blogPostTable, input.q ?? "")), desc(blogPostTable.id))
        .$dynamic(),
      input,
    ),
  ),
```

The input of `list` is `blogPostListInput`, a [`listQuery()`](./database.md#sorting-and-filtering) of `blogPostListColumns` in `shared/schemas/blog-post.ts`. The list sorts by `id`, each field except `json`, each `--searchable` column, `createdAt` and `updatedAt`. It filters a `string`, `text` or `email` field by text, a `boolean` field by yes or no, a `date` or `timestamp` field by a date range, and an `enum` field by its values. Edit `blogPostListColumns` to change them: the router and the `--ui` list both read it.

With fields, `--crud` writes them in the table and in the Zod inputs, as `make:schema` does. See [Fields](#fields). The `create` and `update` mutations take their inputs from these Zod schemas, so every field is in the input of the client. The update action saves only the fields in its input. An input with only `id` changes nothing and returns the row. For a reference to a table with an `ownerId` column, the create action and the update action first load the target row of the signed-in user, and give `NOT_FOUND` when it is not there. The update action does this only when the reference changes. See [Authorization: checking a parent row](./authorization.md#checking-a-parent-row).

```sh
nuxvel make:router task --crud title status:enum=open,done:default=open project:references
```

The generated test fills each field of the factory with a sample value. It fills a reference with the id of a row that the factory of the target table creates. When the app has a factory for the target table under `server/factories/` or `server/domains/<domain>/factories/`, the test imports that factory. Otherwise, the test defines the factory inline. The inline factory fills only `ownerId`. If the target table has a different required reference, the command stops with an error. Create a factory for the target table with `nuxvel make:factory` first. `factory:sync` then keeps the references of that factory correct.

### `nuxvel make:resource <name>`

```sh
nuxvel make:resource blog-post
nuxvel make:resource blog-post --soft-deletes --searchable title,body --ui
```

`nuxvel make:resource` writes the same files as `nuxvel make:router
<name> --crud`, and takes the same `--soft-deletes`, `--searchable` and
`--no-openapi` flags. Its test at `server/trpc/routers/<name>.router.test.ts` does more. It proves that `list`, `byId`, `create`, `update`, `delete` and authorization work from end to end, through `actingAs` and `expectRow` from `@nuxvel/nuxt/testing`. It also holds the same constant-query test for `list`. With `--searchable`, the test also finds a row by its search text. Without `--soft-deletes`, it checks that another user gets `FORBIDDEN` on a delete, and that the owner deletes the row. With `--soft-deletes`, it deletes and restores a row. One command gives one working CRUD slice.

```sh
nuxvel make:resource task title due_on:date project:references
```

`make:resource` takes fields, as `make:router --crud` does. Every field is in the input of the client. The test sends a sample value for each field to `create` and `update`, for example `"Sample text"` for a `string` and `"2026-01-31"` for a `date`. For a reference, it creates a row of the target table and sends its id. When the target table has an `ownerId`, that row belongs to the test user. The test has five cases: it creates a row, updates a row, refuses an update by another user, deletes a row for its owner only, and lists in a constant number of queries. The generated code finds the owner with `actor.userId`, loads a row with `findAuthorized()`, writes with `insertOne()` and `updateOne()`, and calls `softDelete(table, id)` and `restore(table, id)`. A row that an API key creates belongs to the user of the key. The update case also sends an update with only `id`, and checks that the row stays the same.

With `--ui`, the command also writes the pages of the resource. They use [Nuxt UI](./frontend.md#nuxt-ui):

| File | Page |
| --- | --- |
| `app/pages/(app)/<name>/index.vue` | The list at `/<name>`, in a [`<DataTable>`](./frontend.md#data-tables) that sorts and filters by `<name>ListColumns`. With `--searchable`, the table has a search input. Each row has an **Edit** link, which opens the edit form in a modal at `?edit=<id>`, and a **Delete** button. |
| `app/pages/(app)/<name>/new.vue` | A form that creates a row, on [`useActionForm()`](./frontend.md#forms). The new row goes into the cached lists at once. |
| `app/components/<Name>Form.vue` | The edit form, on `useActionForm()`. The saved row replaces the row in the cached lists at once. |

The pages need a signed-in user. The starter has an empty `app/pages/(app)/` folder, so the command writes them into it, and the [route group](./frontend.md#route-groups) gives them the `auth` middleware and the `app` layout. In an app without that folder, they go to `app/pages/<name>/` with `definePageMeta({ middleware: "auth" })`.

A reload of `/<name>?edit=<id>` opens the modal again. An ID that does not exist shows an alert and removes `?edit=` from the URL. Closing the modal or saving removes it too.

The form has one control for each field, and one `<UInput>` for each `--searchable` column. The list has one column for each field and each `--searchable` column. A `timestamp` column shows the value with [`<DateTime>`](./rendering.md#dates). A `json` field has no control and no column. The type of the field sets the control:

| Type | Control |
| --- | --- |
| `text` | `<UTextarea>` |
| `boolean` | `<UCheckbox>` |
| `integer`, `bigint` | `<UInputNumber>` |
| `references` to a table with a CRUD router | `<USelect>` with the rows of that table |
| `references` to a table with no CRUD router, for example `user` | `<UInputNumber>` for an integer id, `<UInput>` for other ids |
| `enum` | `<USelect>` with the values of the enum |
| `email`, `date` | `<UInput>` with `type="email"` or `type="date"` |
| `timestamp` | `<UInput type="datetime-local">`. The time is in the time zone of the browser. The input shows only in the browser, not in the server render. |
| All other types | `<UInput>` |

The `<USelect>` of a reference gets its rows from the `list` procedure of the target router, with `perPage: 100`. It shows only the first 100 rows. The label of each row is the first `string` or `text` column of the target table. If the table has no such column, the label is the id.

On the new page, a field starts with its `default=` value. A `nullable` field starts as `null`, and an empty input sets it to `null` again. Other fields start empty: `""`, `0`, `false`, the first value of an enum, the current time for a `timestamp`, or `{}` for a `json` field. A reference starts as `undefined`, so the form tells the user to set it.

The list page and the new page use the `auth` middleware, so a signed-out visitor goes to the sign-in page. The edit form opens on the list page. After a save, the page opens the list, which shows the flash message of the mutation.

The **Delete** button asks with [`useConfirm()`](./frontend.md#confirm-dialogs). The delete is [optimistic](./frontend.md#optimistic-updates): the row leaves the current page of the list at once, before the server answers. If the server refuses the delete, for example with `FORBIDDEN` for a user who does not own the row, the row comes back and an alert shows the error. The create and the update are not optimistic.

The command writes no factory file. The test defines its own factory for the new table. For a referenced table, the test uses the factory of the app when the app has one. See `make:router --crud`.

### `nuxvel make:test <path>`

```sh
nuxvel make:test actions/posts/create-post.action   # server/actions/posts/create-post.action.test.ts
nuxvel make:test trpc/routers/health.router   # server/trpc/routers/health.router.test.ts
```

`nuxvel make:test` writes a functional test scaffold at `server/<path>.test.ts`, next to its target. `<path>` is the path of the target file under `server/`, without extension. The target must exist. The command writes only the test file. The kind at the end of the file name is not part of the definition name: `jobs/post/notify.job` gives the job `post.notify`.

The scaffold is an `it.todo` for the real test, which drives the target with the fixtures from `@nuxvel/nuxt/testing`. See [Testing](./testing.md).

The folder of the target picks the fixture that the `it.todo` names:

| Target folder | Kind | `it.todo` names |
|---|---|---|
| `actions/` | action | `runAction()` for `<domain>.<name>` |
| `trpc/routers/` | router | `actingAs(user).api.<router>` and `guest().api.<router>` |
| `jobs/` | job | `runJob()` for the dotted job name |
| `listeners/` | listener | `runListener()` for the dotted listener name |
| any other | none | `runAction`, `runJob`, `actingAs`, `emit` |

A target in a domain folder gets the same kind from its kind folder, and the name of the domain: `domains/order/jobs/pack.job` gives the job `order.pack`, and `domains/post/routers/post.router` gives the router `post`.

```sh
nuxvel make:test utils/notify --job
```

Pass `--action`, `--router`, `--job` or `--listener` to pick the kind yourself. Pass one flag only. Two flags exit with code `2`.

In a terminal, when no flag gives the kind and the folder does not tell it, the command asks for the kind. Pick `other` for the scaffold with no kind. Outside a terminal, the command does not ask.

```sh
nuxvel make:test posts/new --e2e   # tests/e2e/posts-new.test.ts
```

With `--e2e`, `<path>` is a page path. The command writes an end-to-end test to `tests/e2e/`, with the `/` in the path replaced by `-`. The test opens `/<path>` with [`visit()`](./testing.md#visit), which starts the browser. The test does not call a setup function. The test fails when the page has an error or goes to a different URL. No server file needs to exist. Run it with [`nuxvel test:e2e`](#nuxvel-teste2e).

`make:test` does not run `nuxt prepare`. The app builds when the test starts it, and Nuxt leaves `*.test.ts` files out of route and type discovery.

### `nuxvel make:job <name>`

```sh
nuxvel make:job post.notify-subscribers   # server/jobs/post/notify-subscribers.job.ts
```

`nuxvel make:job` writes a job and its test. The dots of the name become folders, so the path of the file gives the name back. The test runs the job with `runJob`. Give [fields](#fields) after the name to write them into the `input` schema. See [Queues](./queues.md).

### `nuxvel make:mail <name>`

```sh
nuxvel make:mail order.shipped   # server/mail/order/shipped.mail.ts + server/mail/templates/OrderShipped.vue
```

`nuxvel make:mail` writes a mail definition, its Vue template and its test. The mail names its template with `template: "OrderShipped"`. With `--domain parcel`, the template goes in `server/domains/parcel/mail/templates/`. The template wraps a heading, a paragraph, a button and a link in `<MailLayout>`. It uses the MJML mail components (`<EHeading>`, `<EText>`, `<EButton>`, `<ELink>` inside an `<EText>`) and sets styles with MJML attributes, for example `background-color="#4f46e5"`. The title of the mail is also the preview line that the inbox shows. The test renders the mail and checks its HTML, its Outlook markup and its text version. See [Mail](./mail.md).

### `nuxvel make:notification <name>`

```sh
nuxvel make:notification post.published   # server/notifications/post/published.notification.ts
```

`nuxvel make:notification` writes a notification and its test. The notification goes through the `database` channel. Its input is a `body`, and its `message` builds the row from it. The test sends it to a new user with `sendNotification` and checks it with `expectNotified`. See [Notifications](./notifications.md).

### `nuxvel make:webhook <name>`

```sh
nuxvel make:webhook billing   # server/webhooks/billing.webhook.ts, POST /api/webhooks/billing
```

`nuxvel make:webhook` writes a webhook and its test. The webhook checks an HMAC-SHA256 of the body, sent in the `x-signature` header, against `NUXT_<NAME>_WEBHOOK_SECRET`, here `NUXT_BILLING_WEBHOOK_SECRET`. Change both to what your provider uses. The test signs its deliveries with `deliverWebhook` and sends only the bad signature with `guest().fetch`. A signed delivery whose payload does not match its schema gets a success response and is ignored, not a 500. See [Webhooks](./webhooks.md).

### `nuxvel make:channel <name>`

```sh
nuxvel make:channel announcements   # server/channels/announcements.channel.ts
```

`nuxvel make:channel` writes a realtime channel and its test. The channel allows signed-in users only. See [Realtime](./realtime.md).

### `nuxvel make:factory <table>`

```sh
nuxvel make:factory post   # server/factories/post.factory.ts, for server/database/schema/post.schema.ts
```

`nuxvel make:factory` writes a test factory for a table, and its test. The factory file imports `postTable` from the schema file and exports `postFactory`. It then runs [`factory:sync`](#nuxvel-factorysync-name) on the new file, also when the file is in a module (`--module`), so the factory holds a value for each required column. A foreign key column gets a row from the factory of its target table. Change the values that need domain meaning. See [Testing](./testing.md#factories).

### `nuxvel make:seeder <name>`

```sh
nuxvel make:seeder blog.posts   # server/seeders/blog/posts.seeder.ts
```

`nuxvel make:seeder` writes a seeder. The dots of the name become folders, so the path of the file gives the name back. The command does not write a test. Test a seeder with `runSeeder`. See [Seeding](./database.md#seeding).

### `nuxvel factory:sync [name]`

```sh
nuxvel factory:sync         # every factory
nuxvel factory:sync post   # the factory file post.factory.ts only, or post.ts
```

`nuxvel factory:sync` adds values to the factories under `server/factories/` and `server/domains/<domain>/factories/`, in the app and in each module for the columns that became required after you wrote the factory. A column needs a value when it is `NOT NULL`, has no database default, and the factory does not cover it. The factory may import its table from `#nuxvel/schema` or from the schema file by a relative path.

The command prints one line on stdout for each factory that it changes, for example `post.factory.ts: added slug, rank`. When no factory needs a change, stderr shows `✔ All factories are up to date`. A name that matches no factory file stops the command with exit code `1`.

It writes the same value that `defineFactory` derives at runtime, as source code. See the table in [Testing](./testing.md#factories). For example, an `email` column gets `() => faker.internet.email()`, and a unique text column gets `() => crypto.randomUUID()`. When a value calls Faker and the file does not import `faker`, the command adds `import { faker } from "@faker-js/faker";` at the top.

A required foreign key column gets a new row from the factory of the table that it points at. For example, `authorId` gets `async () => (await userFactory()).id`, and the command adds the import of `userFactory`. The command finds that factory in the same factory folders: it is the file whose `defineFactory` gets the target table, and it must export a `...Factory` constant. When no factory has the target table, the column gets the value from its type.

The command leaves the columns that you already cover alone, so a second run changes nothing. It parses the factory and does not search its text, so a key that is only in a comment or a string is not a covered column. When `make:factory` wrote the factory and nobody edited it since, `nuxvel upgrade --dry-run` still reports it as unedited.

### `nuxvel make:loadtest`

```sh
nuxvel make:loadtest [--force]
```

`nuxvel make:loadtest` writes a [k6](https://k6.io) script to `tests/load/procedures.js`. The script requests every query procedure of the tRPC router of the app. The command reads the router from the loaded app, as `nuxvel route:list` does. It leaves out mutations, so you can point the script at staging. Run it against a server with realistic data before a launch or a large change:

```sh
nuxvel make:loadtest
k6 run -e BASE_URL=https://staging.example.com tests/load/procedures.js
# or, without installing k6:
docker run --rm -v "$PWD/tests/load:/scripts" -e BASE_URL=https://staging.example.com \
  grafana/k6 run /scripts/procedures.js
```

`BASE_URL` defaults to `http://localhost:3000`. The script runs 10 virtual users for 30 seconds. It fails when more than 1% of requests fail, or when the 95th percentile is more than 500 ms. A `4xx` response counts as answered.

A procedure that needs input or a signed-in user answers `4xx` before it reaches its handler. To load it for real, add the input, and a session cookie, to the request. A second run writes the file again, so run it with `--force` after you add procedures.

The generators for tasks, backfills, flags, schedules and events are in their own sections: [`make:task`](#nuxvel-maketask-name), [`make:backfill`](#nuxvel-makebackfill-name---table-table), [`make:flag` and `make:experiment`](#nuxvel-makeflag-name), [`make:schedule`](#nuxvel-makeschedule-name), [`make:event`](#nuxvel-makeevent-name) and [`make:listener`](#nuxvel-makelistener-name---event-event).

### Custom templates

```
.nuxvel/templates/action.ts.txt   # replaces what make:action writes
```

Each `make:*` file comes from a template. To change what a generator writes, put a file with the name of the template in `.nuxvel/templates/`. The generator uses it instead of the built-in template.

A placeholder is written `{{name}}`. Start from a copy of the built-in template, in `src/generators/templates/` of `@nuxvel/cli`, so you keep the placeholders that it fills. A placeholder that the generator does not know stops it with an error that names the placeholder.

| Command | Templates |
| --- | --- |
| `make:schema` | `schema-table.ts.txt`, `schema-zod.ts.txt` |
| `make:policy` | `policy.ts.txt` |
| `make:action` | `action.ts.txt`, `action-test.ts.txt` |
| `make:router` | `router.ts.txt` |
| `make:router --crud` | `schema-table-crud.ts.txt`, `schema-zod.ts.txt`, `user-data.ts.txt`, `policy-crud.ts.txt`, `action-crud-create.ts.txt`, `action-crud-update.ts.txt`, `action-crud-hard-delete.ts.txt`, `router-crud.ts.txt`, `router-crud-test.ts.txt`. With `--soft-deletes`, `action-crud-delete.ts.txt` replaces `action-crud-hard-delete.ts.txt`, and `action-crud-restore.ts.txt` is added |
| `make:resource` | The `--crud` set, with `resource-test.ts.txt` in place of `router-crud-test.ts.txt`. `--ui` adds `page-resource-index.vue.txt`, `page-resource-new.vue.txt` and `component-resource-form.vue.txt` |
| `make:test` | `test-scaffold.ts.txt`, and `e2e-test.ts.txt` with `--e2e` |
| `make:task` | `task.ts.txt` |
| `make:backfill` | `backfill.ts.txt`, `backfill-test.ts.txt` |
| `make:flag` | `flag.ts.txt` |
| `make:experiment` | `experiment.ts.txt` |
| `make:schedule` | `schedule.ts.txt` |
| `make:job` | `job.ts.txt`, `job-test.ts.txt` |
| `make:mail` | `mail.ts.txt`, `mail-template.vue.txt`, `mail-test.ts.txt` |
| `make:notification` | `notification.ts.txt`, `notification-test.ts.txt` |
| `make:webhook` | `webhook.ts.txt`, `webhook-test.ts.txt` |
| `make:channel` | `channel.ts.txt`, `channel-test.ts.txt` |
| `make:factory` | `factory.ts.txt`, `factory-test.ts.txt` |
| `make:seeder` | `seeder.ts.txt` |
| `make:event` | `event.ts.txt`, `event-test.ts.txt` |
| `make:listener` | `listener.ts.txt`, `listener-test.ts.txt` |
| `make:loadtest` | `loadtest.js.txt` |
| `make:page` | `page.vue.txt` |
| `make:story` | `story.ts.txt` |

### `nuxvel upgrade`

```sh
nuxvel upgrade [--dry-run] [--only <codemod>]
```

Run `nuxvel upgrade` after `npm update @nuxvel/nuxt @nuxvel/cli`. It applies the codemods of the installed nuxvel: each one rewrites the code that a release changed, so the app takes the release without the hand steps of the [changelog](../CHANGELOG.md). It prints each file that it changes on stdout:

```
updated: package.json
```

| Codemod | Since | What it changes |
| --- | --- | --- |
| `test-aliases` | 0.3.0 | Adds `#nuxvel/schema`, `#nuxvel/factories`, `#server/*` and `#shared/*` to the `imports` of `package.json`, so tests can import them |
| `imports` | 0.3.0 | Rewrites a `../` import into another kind folder to its alias, and removes an import of `shared/schemas/` from `app/` and `server/`, as `eslint --fix` with `nuxvel/no-parent-imports` does, see [Imports](./auto-imports.md#imports). It leaves a renamed import of `shared/schemas/`, a namespace or default import of a table or a factory, and an import of server code from `app/`, as manual steps |
| `use-trpc` | 0.3.0 | Replaces `useTRPC()` with [`$api`](./api.md#calling-from-the-client). A `const` bound to `useTRPC()` goes, and each use of it, in the script and in the template, becomes `$api`. `ReturnType<typeof useTRPC>` becomes `typeof $api`, and `import { useTRPC } from "#imports"` imports `$api`. A `const` set to `useQuery($api.<path>.queryOptions(input))`, or to `useQuery(() => $api.<path>.queryOptions(input))`, becomes `$api.<path>.useQuery(input)` or `$api.<path>.useQuery(() => input)`, and one set to `useMutation($api.<path>.mutationOptions())` becomes `$api.<path>.useMutation()`, when each use of it reads `.value` of a member, which drops the `.value`, calls one of its functions, or is the `:query` of a component. Any other shape, such as destructuring or a spread into the options, stays as it is. It leaves a file that declares its own `$api`, an import of `useTRPC` under another name, and the name `"useTRPC"` in a string, such as `mockNuxtImport("useTRPC", ...)`, as manual steps |
| `invalidate` | 0.3.0 | Removes a hand-written `invalidateQueries({ key: $api.<path>.key(...) })` from the `onSuccess` or `onSettled` of a mutation, which the client now [invalidates](./frontend.md#invalidation) itself: in `$api.<path>.useMutation({ ... })`, in `useMutation({ ...$api.<path>.mutationOptions(), ... })` and in the options of `useActionForm(schema, $api.<path>.mutationOptions(), { ... })`, also inside `toasted()` or `optimistic()` of an older app. It removes the call only when the key is in the namespace of the mutation (`$api.post.key()` for `$api.post.update`), and also a callback it leaves empty and a `useQueryCache()` that nothing else uses. A key of another namespace, `exact: true` and a mutation with its own `invalidate` stay as they are. Skip it when the app sets `nuxvel.api.invalidateFallback: false` |
| `mutation-options` | 0.3.0 | Replaces `toasted(options, title)` and `optimistic(options, { key, apply })` with the [`toast`](./frontend.md#success-toasts) and [`optimistic`](./frontend.md#optimistic-updates) options of `$api.<path>.mutationOptions()`, also when they wrap each other or `{ ...$api.<path>.mutationOptions(), onError }`. Then a `const` set to `useMutation($api.<path>.mutationOptions({ ... }))` becomes `$api.<path>.useMutation({ ... })`, as `use-trpc` does it. It leaves a wrapper around other options, such as a variable, and an import of `toasted` or `optimistic`, as manual steps |
| `audit` | 0.3.0 | Moves `.use(audited(name, { target }))` of a procedure to the [`audit: { name, target }` option](./audit.md#auditing-an-action) of the action its `.mutation()` calls, imported or from `$actions`, with an import of the table in the action file, and removes the table import that the router no longer uses. A mutation that calls no action gets `audit(name, { type: getTableName(target), id: opts.input.id })` in its handler, which records no changed columns, and a manual step that says so. It leaves a name that is not a string, a target that is not a table name, a procedure without `.mutation()`, a mutation that calls more than one action, an action that two procedures audit, an action that other code or another procedure also calls, whose `audit` option would audit that call too, and an action that already has `audit`, as manual steps |
| `action-form` | 0.3.0 | Rewrites `useActionForm(schema, $api.<path>.mutationOptions(options), formOptions)` to [`useActionForm($api.<path>, { ...options, ...formOptions })`](./frontend.md#forms), also from `trpc.<path>.mutationOptions()`. It drops `schema` when it is the input schema the procedure takes from `shared/schemas/`, and keeps it as the `schema` option otherwise. It leaves options that are not `.mutationOptions()` of a procedure, an `onSuccess` in `.mutationOptions()`, and a key in both objects, as manual steps |
| `actor-arg` | 0.3.0 | Removes the actor argument of `can()`, `authorize()` and `canMany()` when it is `ctx.actor`, or an `actor` that the enclosing function takes as a parameter, because they now read the actor of the running procedure, action, job or seeder. Any other actor stays, with a manual step |
| `removed-globals` | 0.3.0 | Replaces `SYSTEM_ACTOR_TYPE` with `"system"` and `API_KEY_ACTOR_TYPE` with `"api-key"`, and the server `auth()` with `useAuth()` where the code reads only its `.user`. Any other `auth()` stays, with a manual step |
| `definition-methods` | 0.3.0 | Rewrites `dispatchAfterCommit(job, input, options?)`, `broadcast(channel, event, payload, params?)`, `broadcastAfterCommit(...)`, `sendMail(mail, input, options?)`, `emit(event, payload)` and `notify(userIds, notification, data)` to the method of the definition: `$jobs.<path>.dispatch(input, options?)`, `$channels.<path>.broadcast(event, payload, params?)`, `$mails.<path>.send(input, options?)`, `$events.<path>.emit(payload)` and `$notifications.<path>.notify(userIds, data)`. A string name becomes its `$` path in camelCase (`"post.notify-followers"` is `$jobs.post.notifyFollowers`). A definition reached through its `$<kind>` namespace, an import whose name ends with the kind (`postPublishedEvent`) or a `define*()` in the file gets the method. It leaves a call whose name it cannot map, such as a variable, an imported string constant, `event.name` or a template string, and a string name of a `renamed()` job, which has no `$jobs` key, as a manual step, and skips a function of the same name that the file declares or imports, such as the `emit` of `defineEmits()` |
| `durations` | 0.3.0 | Rewrites a [duration](./cache.md#durations) given as a number to an object, with the largest unit that fits: the `ttl` of `remember()`, `cachePut()` and `withLock()` and the `expiresIn` of `signedUrl()` from seconds (`7 * 24 * 60 * 60` becomes `{ days: 7 }`), and the `timeout` and `backoff` of `defineJob()` and the `delay` of `$jobs.<path>.dispatch()` from milliseconds (`30_000` becomes `{ seconds: 30 }`). It computes a number literal and `*`, `+`, `-` and `/` of number literals. It leaves any other value, such as a variable, and a value of zero or less, as a manual step |
| `presence-params` | 0.3.0 | Wraps an object literal room of `usePresence(channel, room)` in its `params` option: `usePresence(channel, { params: room })`, as [`useChannel()`](./realtime.md#listening-from-a-component) takes it. It leaves a call that already passes `{ params }`, and prints any other second argument, such as a variable or a call, as a manual step |
| `notification-input` | 0.3.0 | Renames `schema` to `input` in [`defineNotification()`](./notifications.md#defining-a-notification), and in each object that its `toMail` returns, `data` to `input` and a mail name to its `$mails` definition (`"post.published"` becomes `$mails.post.published`). It leaves a `toMail` that does not return object literals, such as a variable, a mail name it cannot map, a `mail` that is a variable, a shorthand or a template literal, a config that is not an object literal, and a config with a spread, as manual steps |
| `upload-pending` | 0.3.0 | Renames `uploading` of [`useUpload()`](./frontend.md#uploading-without-the-field) to `isPending`. A destructured `uploading` becomes `isPending`, or `isPending: uploading` when the file uses the name elsewhere, and `.uploading` on the result of `useUpload()` becomes `.isPending`. It leaves `uploading` on any other object, and prints a destructured `uploading` with a default, such as `{ uploading = false }`, as a manual step |
| `live-query-reactive` | 0.3.0 | Removes the `.value` after a field of a `const` bound to [`useLiveQuery()`](./frontend.md#live-lists), in the script and in the template, and after a field of a `useLiveQuery()` call: `posts.data.value` becomes `posts.data`, as `useLiveQuery()` now returns the `reactive()` shape of `$api.<path>.useQuery()`. It wraps a destructured `useLiveQuery()` in `toRefs()`, so the destructured fields stay refs. It prints a field passed to `watch()`, `unref()` or `toValue()`, a write to a field's `.value`, and a `const` bound to `useLiveQuery()` that is destructured or passed to a call other than `toRefs()`, as manual steps |
| `test-client-api` | 0.3.0 | Renames `trpc` of the [test client](./testing.md#acting-as-a-user) of `actingAs()`, `guest()` and `signIn()` to `api`. `.trpc` on the call, or on a `const` bound to it, becomes `.api`. A destructured `trpc` becomes `api`, and each use of it too, or `api: trpc` when the file already uses the name `api`, and `{ trpc: caller }` becomes `{ api: caller }`. In a file that calls one of them, it prints any other `.trpc`, such as one on a client that a helper returns, and a destructured `trpc` with a default, as manual steps |
| `cli-names` | 0.3.0 | Rewrites the renamed commands, also run through `./nv` or `nv`, in `package.json`, the workflows in `.github/workflows/` and the `Dockerfile`: `nuxvel test` becomes `nuxvel test:functional`, `channels`, `events`, `routes` and `releases` become `channel:list`, `event:list`, `route:list` and `release:list`, `flags:list`, `flags:set` and `flags:stale` become `flag:list`, `flag:set` and `flag:stale`, and `push:keys` becomes `key:push` |
| `explicit-sdk-imports` | 0.3.0 | Adds `import { useS3 } from "@nuxvel/nuxt/storage"`, `import { useQueue } from "@nuxvel/nuxt/queue"` and `import { useRedis } from "@nuxvel/nuxt/redis"` to each `.ts` file that uses the name without an import, as they are [no longer auto-imported](./auto-imports.md#introduction). It leaves a file that imports or declares the name |

The command runs every codemod, oldest first. A codemod changes only the code that still needs it, so a second run changes nothing and prints `✔ No codemod changed a file`. `--only <codemod>` runs one codemod. An unknown name exits `2` and lists the codemods.

A codemod leaves code that it cannot rewrite safely as it is, and prints the file and line with the step to take by hand, on stderr:

```
▲ package.json:9: #server/* maps to "./src/server/*": map it to "./server/*" so tests can import it
▲ server/jobs/report/monthly.job.ts:1: ../../database/schema/auth.schema leaves server/jobs/ for server/database/schema/: import it from #nuxvel/schema
```

`--dry-run` writes nothing. It prints what the codemods would change as a unified diff on stdout:

```diff
--- a/package.json
+++ b/package.json
@@ -5,3 +5,7 @@
   "imports": {
-    "#nuxvel/test-namespaces": "./.nuxt/nuxvel/test-namespaces.mjs"
+    "#nuxvel/test-namespaces": "./.nuxt/nuxvel/test-namespaces.mjs",
+    "#nuxvel/schema": "./.nuxt/nuxvel/schema.ts",
+    "#nuxvel/factories": "./.nuxt/nuxvel/factories.ts",
+    "#server/*": "./server/*",
+    "#shared/*": "./shared/*"
   },
```

Then it reports the generated files that you edited by hand:

```
modified: server/policies/blog-post.policy.ts
missing: server/actions/posts/create-post.action.ts
```

nuxvel records each file that a `make:*` command writes in `.nuxvel/generated.json`. The record holds the template of the file, the version of that template, and a hash of what the command wrote. `upgrade --dry-run` hashes those files again and reports the ones that you edited since, or deleted. When you edited nothing, stderr shows `✔ No generated files were hand-edited`.

A `generated.json` that is not valid JSON, or that has an entry without its `template`, `templateVersion` and `hash`, stops the command. The error names the path, and the command exits `1`. `make:*` and `factory:sync` also update the file, and they fail the same way. Fix the entry, or delete the file to stop tracking what was generated so far.

Commit `.nuxvel/generated.json`, `.nuxvel/templates/`, `.nuxvel/known_hosts` (the pinned SSH host keys of `server:setup`) and `.nuxvel/rehearsals.json` (the [restore rehearsals](./deploy.md#rehearsing-a-restore)). The rest of `.nuxvel/` is build output. The `.gitignore` of the starter already does this.

## Queues and schedules

### `nuxvel queue:work`

```sh
nuxvel queue:work [--concurrency <n>] [--queue <names>]
```

`nuxvel queue:work` runs the jobs under `server/jobs/` when they are dispatched, and the schedules under `server/schedules/` on their clock. It is a long-running process, separate from the web server. `nuxvel dev` already runs a worker inside the dev server, so use `queue:work` outside `nuxvel dev`.

```sh
nuxvel queue:work
nuxvel queue:work --concurrency 10   # default is 5
nuxvel queue:work --queue mail,default
```

`--concurrency` must be a whole number of at least 1. Another value is a usage error (exit `2`). Each queue runs that many jobs at the same time.

`--queue` runs only the listed queues, one BullMQ worker for each, in one process. Without it, the worker runs every queue that a job uses. A queue that no job uses stops the worker with exit `1`. See [Named queues](./queues.md#named-queues).

The worker is the Nitro server of the app, started with `NUXVEL_ROLE=worker`. In production, run the built server that way instead, under a process manager or as a second container of the same image:

```sh
NUXVEL_ROLE=worker node .output/server/index.mjs
```

The worker reads `NUXT_REDIS_URL` and `NUXT_DATABASE_URL`. Jobs and listeners run inside the Nitro server of the app, with its auto-imports and runtime config. The worker logs a startup line and one `job` line for each attempt (done, retrying, failed). The command sets the `pretty` log format, unless `NUXT_LOG_FORMAT` is set or `NODE_ENV` is `production`. See [Queues](./queues.md#running-jobs).

### `nuxvel queue:failed`

```sh
nuxvel queue:failed [--json]
```

`nuxvel queue:failed` lists the jobs that used all of their attempts:

```
QUEUE    ID  NAME          ATTEMPTS  FAILED AT                 REASON
default  42  post.publish  5         2026-02-04T03:00:01.114Z  connect ECONNREFUSED 127.0.0.1:1025
  → Once the cause is fixed, run nuxvel queue:retry <id>, or nuxvel queue:retry all
nuxvel queue:retry 42 --queue mail
```

The list covers every queue. `--json` prints `{ "jobs": [{ "queue", "id", "name", "attempts", "failedAt", "reason" }] }`.

### `nuxvel queue:retry <id|all> [--queue <name>]`

```sh
nuxvel queue:retry 42    # one job, by the id that queue:failed printed
nuxvel queue:retry all
```

`nuxvel queue:retry` puts failed jobs back on the queue after you fix the cause. A running worker picks up each retried job. The job leaves the failed set when it succeeds.

An id that matches no failed job exits `1`. So does `all` when no job failed. Each queue numbers its jobs. When failed jobs in two queues have the same id, the command exits `1` and asks for `--queue`.

### `nuxvel queue:clear`

```sh
nuxvel queue:clear [--failed | --waiting] [--queue <names>] [--force]
```

`nuxvel queue:clear` removes jobs that have not run. It asks for a confirmation first:

```
◆  Remove the waiting and failed jobs of every queue?
│  ○ Yes / ● No
✔ Removed 12 waiting and 3 failed job(s) from default, mail
```

| Option | Removes |
|---|---|
| none | The waiting, prioritized, delayed and failed jobs. |
| `--waiting` | The waiting, prioritized and delayed jobs. |
| `--failed` | The failed jobs. |
| `--queue mail,default` | Jobs of the listed queues only. Without it, jobs of every queue. |
| `--force` | Does not ask for a confirmation. |

Running jobs and completed jobs stay. The command puts the next tick of each schedule back on the `default` queue, so the schedules keep their timing. A queue that no job uses exits `1`.

Outside a terminal, for example in CI, the command cannot ask. It then exits `1` unless you pass `--force`.

### `nuxvel queue:versions`

```sh
nuxvel queue:versions [--json]
```

`nuxvel queue:versions` groups the jobs that are still to run by job name and payload version. It flags a version that the job cannot migrate. See [Payload versions](./queues.md#payload-versions).

```
NAME                     VERSION  JOBS  DELAYED  PRIORITIZED  PROBLEM
nuxvel.prune-outbox      cron     1     1        0
post.archive             v1       1     0        0            no upcaster for version 1
post.notify-subscribers  v1       2     0        0
post.notify-subscribers  v2       11    3        2
▲ 1 group the current code cannot run
  → Add an upcaster or a renamed() alias, or let those jobs drain before deploying
```

The jobs to run are the waiting, delayed, prioritized and active ones, and the ones that wait on children. Completed and failed jobs are not in the list. The next run of a schedule, the built-in `nuxvel.prune-outbox` included, shows as `cron`. `DELAYED` counts the jobs of the group that wait out a dispatch `delay`. `PRIORITIZED` counts the jobs that have a `priority`. See [Delay and priority](./queues.md#delay-and-priority).

Run the command before you deploy a job whose payload changed. A flagged group fails when the new code picks it up. `--json` prints `{ "groups": [{ "name", "version", "schedule", "count", "delayed", "prioritized", "problem" }] }`. A tick of a schedule has `version: null` and `schedule: true`. A group that the code can run has `problem: null`.

### `nuxvel make:schedule <name>`

```sh
nuxvel make:schedule posts.prune-drafts   # server/schedules/posts/prune-drafts.schedule.ts
```

`nuxvel make:schedule` writes a schedule that runs every day at 03:00. The dots of the name become folders, so the path of the file gives the name back. The file exports `postsPruneDraftsSchedule`. Change `at` or `every`, and the handler. The command writes no test. See [Schedules](./queues.md#schedules).

### `nuxvel schedule:list`

```sh
nuxvel schedule:list [--json]
```

`nuxvel schedule:list` lists the schedules under `server/schedules/`, with when each one runs, in words, and its next run. It also flags each repeatable entry in Redis that no `defineSchedule` matches.

```
NAME                RUNS             NEXT RUN                  NOTE
posts.prune-drafts  03:00 every day  2026-02-04T03:00:00.000Z
posts.old-digest    -                2026-02-04T09:00:00.000Z  orphaned, no defineSchedule in code
▲ 1 orphaned schedule in Redis
  → Run nuxvel schedule:prune once every worker runs this code
```

A worker leaves an orphan alone, because during a deploy the orphan can belong to a worker that runs newer code. A schedule with no next run has no registration yet, and its note is `not registered, run queue:work`. Start the worker one time to register it. A moved schedule whose old path keeps a `renamed()` alias shows `stored as <old name>`: the entry that it continues to use.

`--json` prints `{ "schedules": [{ "name", "storedAs", "description", "pattern", "nextRun", "orphaned" }] }`. An orphan has the pattern that it was registered with, and no description.

### `nuxvel schedule:prune`

```sh
nuxvel schedule:prune
```

```
✔ Removed posts.old-digest, no defineSchedule in code
```

`nuxvel schedule:prune` removes each repeatable entry in Redis that no `defineSchedule` under `server/schedules/` matches. These are the entries that a renamed or deleted schedule left behind. Run it only after every worker runs the new code. Otherwise it removes a schedule that a newer build registered. With no orphans, it prints `No orphaned schedules`.

Pass `--dry-run` to see what it would remove. It prints `Would remove posts.old-digest, no defineSchedule in code` for each orphan and removes none.

| Option | Description |
|---|---|
| `--dry-run` | List the orphaned schedules and remove none. |

### `nuxvel schedule:run <name>`

```sh
nuxvel schedule:run posts.prune-drafts
```

```
✔ posts.prune-drafts finished
```

`nuxvel schedule:run` builds and starts the app's Nitro server, and runs one tick of the schedule in it now. It does not use the worker or the queue, and it does not change the next run. When the handler throws, the command prints the error and exits `1`. A name that no schedule has also exits `1`. `nuxvel schedule:list` shows the names. In tests, use [`runSchedule()`](./testing.md#running-app-code).

## Tasks

<a id="nuxvel-maketask--nuxvel-taskrun"></a>

### `nuxvel make:task <name>`

```sh
nuxvel make:task reindex-posts
```

`nuxvel make:task` writes a Nitro task skeleton at `server/tasks/<name>.ts`. See [Tasks](./queues.md#tasks).

### `nuxvel task:run <name>`

```sh
nuxvel task:run <name> [--payload <json>]
```

`nuxvel task:run` runs one task on demand, inside the app. The task runs through the `runTask` of Nitro, under the name that Nitro gives it. For example, `server/tasks/db/migrate.ts` is `db:migrate`.

```sh
nuxvel task:run reindex-posts
nuxvel task:run reindex-posts --payload '{"since":"2026-01-01"}'
```

The command ends with `✔ reindex-posts finished` on stderr, and the result of the task as one line of JSON on stdout. `--payload` takes a JSON object, which the handler gets as `payload`. Any other value is a usage error (exit `2`). An unknown task name exits `1`.

## Billing

### `nuxvel billing:status`

```sh
nuxvel billing:status [--json]
```

`nuxvel billing:status` prints how many Stripe events the app stored, and lists each one that is not processed yet. It reads the `billing_events` table of the app, inside its server. It exits 1 when one of them failed, so a monitor can run it.

```
120 Stripe events stored, 1 not processed
EVENT              TYPE                           RECEIVED                  ATTEMPTS  LAST ERROR
evt_1PqRsTuVwXyZ   customer.subscription.updated  2026-10-04T03:12:09.000Z  3         No such subscription: 'sub_1Pq'
```

See [Billing](./billing.md#the-stripe-webhook).

### `nuxvel billing:replay <eventId>`

```sh
nuxvel billing:replay evt_1PqRsTuVwXyZ
```

`nuxvel billing:replay` processes a stored Stripe event again now, inside the app's server, as the `nuxvel.billing.process-event` job does. Use it once the cause of a failure is fixed. Processing an event again is safe: the job fetches the object from Stripe and records each payment once. It exits 1 when the event is not stored or fails again.

## Backfills

### `nuxvel make:backfill <name> --table <table>`

```sh
nuxvel make:backfill posts-content --table post
```

`nuxvel make:backfill` writes a backfill under `server/database/backfills/`. The backfill walks the table that `server/database/schema/<table>.schema.ts` (or `<table>.ts`) exports as `<table>Table`, for example `postTable`. The command also writes a functional test that runs the backfill to completion. See [Backfills](./backfills.md).

### `nuxvel backfill:status`

```sh
nuxvel backfill:status [--json]
```

`nuxvel backfill:status` lists every backfill that has started. It reads the `backfills` table of the app, inside its server.

```
NAME           ROWS       CURSOR  STATE
posts-content  2000/5120  2000    in progress
```

`STATE` is `in progress` or `done`. `CURSOR` is `none` before the first batch. `--json` prints `{ "backfills": [{ "name", "processed", "total", "cursor", "completedAt" }] }`.

## Flags and experiments

These commands read and change flags without a deploy. They connect with `NUXT_REDIS_URL` and `NUXT_DATABASE_URL`. See [Feature flags](./flags.md).

### `nuxvel make:flag <name>`

```sh
nuxvel make:flag new-checkout   # server/flags/new-checkout.flag.ts, the flag "new-checkout"
```

`nuxvel make:flag` writes a flag under `server/flags/`, off by default. The file name gives the name of the flag.

### `nuxvel make:experiment <name>`

```sh
nuxvel make:experiment checkout-cta   # server/flags/checkout-cta.experiment.ts, the experiment "checkout-cta"
```

`nuxvel make:experiment` writes an experiment under `server/flags/`, with the variants `control` and `treatment` at 50/50.

### `nuxvel flag:list`

```sh
nuxvel flag:list [--json]
```

```
NAME          KIND        DEFAULT  TARGETING                   STATUS
new-checkout  flag        false    10%, role beta-tester=true  -
checkout-cta  experiment  -        control:50 green:50         running
```

`nuxvel flag:list` lists every flag with its default and its current targeting, and every experiment with its variants. A flag with no targeting shows `untargeted`. The status of an experiment is `not started`, `running` or `stopped`.

`--json` prints `{ "flags": [{ "name", "default", "percentage", "roles", "targeting", "updatedAt", "expiresAt" }], "experiments": [{ "name", "variants", "status" }] }`.

### `nuxvel flag:set <name>`

```sh
nuxvel flag:set <name> [--percentage <0-100>] [--role <role>] [--value true|false]
```

| Flag | Description |
| --- | --- |
| `--percentage` | The share of users, from 0 to 100, that the flag is on for. |
| `--role` | A role to fix the value for. Use it with `--value`. The value defaults to `true`. |
| `--value` | `true` or `false`. With `--role`, the value for that role. Alone, on (100%) or off (0%) for everyone. |

```sh
nuxvel flag:set new-checkout --percentage 10
# ✔ new-checkout  10%
nuxvel flag:set new-checkout --role beta-tester --value true
nuxvel flag:set new-checkout --value false   # off for everyone (0%)
```

`nuxvel flag:set` merges the change into the current targeting. It goes through `setFlagTargeting()`, so the audit log records it as `flag.targeted` and open pages update live.

### `nuxvel flag:stale`

```sh
nuxvel flag:stale [--json]
```

```
NAME          STALE         SINCE
new-checkout  expired       2026-12-31
old-banner    unreferenced  -
```

`nuxvel flag:stale` lists the flags that are past their `expiresAt`, at 100% for more than 30 days, or referenced by no code. `--json` prints `{ "flags": [{ "name", "reason", "since" }] }`. `reason` is `expired`, `fully rolled out` or `unreferenced`. `since` is `null` for an unreferenced flag.

### `nuxvel experiment:start <name>`

```sh
nuxvel experiment:start checkout-cta
# ✔ checkout-cta  running
```

`nuxvel experiment:start` starts an experiment and locks its weights. The audit log records the start.

### `nuxvel experiment:stop <name>`

```sh
nuxvel experiment:stop checkout-cta
# ✔ checkout-cta  stopped
```

`nuxvel experiment:stop` stops an experiment. After it stops, everyone gets the control and nuxvel records no exposure. The audit log records the stop.

### `nuxvel experiment:report <name>`

```sh
nuxvel experiment:report <name> [--json]
```

```sh
nuxvel experiment:report checkout-cta
# checkout-cta  sample ratio ok (p=1.00)
# control  weight 50  exposures 100  checkout.completed 10 (10.0%, 95% CI 5.5%–17.4%)
```

`nuxvel experiment:report` prints the exposures and the conversion rate of each variant, with 95% confidence intervals. It also checks for a sample-ratio mismatch. On a mismatch, the first line is `<name>  SAMPLE RATIO MISMATCH (p=<p>): results are not trustworthy`.

`--json` prints `{ "name", "variants": [{ "variant", "weight", "exposures", "metrics": [{ "metric", "conversions", "rate", "low", "high" }] }], "sampleRatio": { "pValue", "mismatch" } }`. `rate`, `low` and `high` are numbers from 0 to 1.

## Audit

### `nuxvel audit:verify`

```sh
nuxvel audit:verify [--json]
```

```
✖ Audit chain broken at row 42: its content no longer matches its hash (41 rows verified before it)
  → Rows after it were not checked; compare it with a backup before trusting the log
```

`nuxvel audit:verify` walks the hash chain of the audit log. It stops and exits `1` at the first row that was modified, or that does not point at the row before it. It then checks the `mac` of each `audit_subjects` and `audit_context` row. An intact chain prints `✔ Audit chain intact: <n> rows verified`. It needs the `NUXT_AUDIT_CHAIN_SECRET` of the server that wrote the rows. See [Audit log](./audit.md).

`--json` prints `{ "intact", "checked", "firstBreak": { "id", "reason" } | null }`, with the same exit code. `reason` is `modified`, `unlinked`, `subject-modified` or `context-modified`. `id` is a string for `subject-modified`.

### `nuxvel audit:tail`

```sh
nuxvel audit:tail
```

```
Tailing audit_log after row 1204, Ctrl-C to stop
2026-09-23T04:12:09.114Z  #1205  user:3f1c...  post.updated  post:42  {"title":{"from":"Draft","to":"Live"}}
```

`nuxvel audit:tail` prints each row of the `audit_log` table when it is written, until you stop it. It runs inside the server of the app. The first line goes to stderr, and the rows go to stdout.

### `nuxvel audit:export`

```sh
nuxvel audit:export [--from <date>] [--to <date>] [--format jsonl|csv]
```

| Flag | Description |
| --- | --- |
| `--from` | The earliest `occurredAt` to include, for example `2026-09-01`. |
| `--to` | The `occurredAt` to stop before. This bound is exclusive. |
| `--format` | `jsonl` (the default) or `csv`. |

```sh
nuxvel audit:export --from 2026-09-01 --to 2026-10-01 --format csv > september.csv
```

`nuxvel audit:export` prints the rows whose `occurredAt` is in `[--from, --to)`, as JSON lines or as CSV. You can leave out either bound. A date without a time zone is in UTC. A value that is not a date, or an unknown format, is a usage error (exit `2`).

In CSV, a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a `'` in front. A spreadsheet then shows the cell as text and does not run it as a formula. See [Security: CSV exports](./security.md#csv-exports).

## Privacy

### `nuxvel user:export <id>`

```sh
nuxvel user:export 3f1c... > export.json
```

`nuxvel user:export` prints every row that a user owns in the tables declared under `server/privacy/`. The output is JSON, keyed by table. See [Privacy](./privacy.md).

### `nuxvel user:erase <id>`

```sh
nuxvel user:erase 3f1c...
# ✔ Erased user 3f1c...: posts 2, user 1
```

`nuxvel user:erase` deletes the same rows in one transaction. The audit log records the erasure as `user.erased`.

The command asks for confirmation in a terminal. Outside a terminal, it refuses to run unless you pass `--force`.

| Option | Description |
|---|---|
| `--force` | Erase without asking. A script or a CI job needs it. |

## Storage

### `nuxvel storage:setup`

```sh
nuxvel storage:setup
```

```
✔ Created bucket blog
✔ Uploads under blog/tmp/ expire after 1 day
```

`nuxvel storage:setup` creates the `NUXT_STORAGE_BUCKET` bucket at `NUXT_STORAGE_URL` if it does not exist. It then sets a lifecycle rule, with the id `expire-temp-uploads`, that expires everything under `tmp/` after one day. [Uploads](./storage.md#uploads) land under `tmp/`.

The command keeps the lifecycle rules that you added yourself, and replaces only the rule with that id. You can run it again. When the bucket exists, the first line is `✔ Bucket <bucket> already exists`.

The command reads the two variables from the shell environment and from the `.env` of the app. A variable in the shell wins over `.env`.

### `nuxvel storage:check`

```sh
nuxvel storage:check
```

```
✔ Wrote, read and deleted a file in blog
✔ blog refuses an upload longer than its signed Content-Length
```

`nuxvel storage:check` writes a small file under `tmp/storage-check/` in the `NUXT_STORAGE_BUCKET` bucket. It reads the file back and deletes it. Then it sends two uploads to a presigned URL. The first upload matches the signed `Content-Length` and must succeed. The second upload is longer and must fail.

Run it after `nuxvel storage:setup`, and after you move to a different storage backend. [Uploads](./storage.md#uploads) depend on storage to refuse a file that does not match its signed length. When the backend accepts the longer upload, the command fails with `✖ <bucket> accepted an upload longer than its signed Content-Length`. The command reads the same variables as `nuxvel storage:setup`.

## Events

### `nuxvel make:event <name>`

```sh
nuxvel make:event post.published   # server/events/post/published.event.ts, exported as postPublishedEvent
```

`nuxvel make:event` writes an event under `server/events/`, and a functional test that emits it with `emit` and checks it with `expectEmitted`. Give [fields](#fields) after the name to write them into the `payload` schema. See [Domain events](./events.md).

### `nuxvel make:listener <name> --event <event>`

```sh
nuxvel make:listener post.notify-subscribers --event post.published   # server/listeners/post/notify-subscribers.listener.ts
```

`nuxvel make:listener` writes a queued listener for the event under `server/listeners/`, and a functional test that checks it with `expectListenerQueued`. The event file must exist. The test emits the event with the sample payload from `<event>.event.test.ts`, the test that `make:event` writes. When that test does not exist, the test emits `{}`. If the payload schema refuses `{}`, the test does not compile. Then write a valid payload in the test.

### `nuxvel event:list`

```sh
nuxvel event:list [--json]
```

```
EVENT           SOURCE                                 EMITTED BY                                   LISTENERS
post.archived   server/events/post/archived.event.ts   nothing                                      none
post.published  server/events/post/published.event.ts  server/actions/posts/publish-post.action.ts  post.notify-subscribers (queued)
▲ post.archived has no listener, nothing reacts to this event
```

`nuxvel event:list` lists the events under `server/events/`, the files that emit them and the listeners that react to them. It warns about each event that nothing listens for. An emitter can be any file under `server/`: an action, a job or a route. An `emit()` call counts with the event name, as in `emit("post.published", ...)`, or with the imported event. An aliased import such as `import { postPublishedEvent as published }` counts too. The namespace form `$events.post.published` counts in `emit()` and in the `event` of a listener.

The command parses the files with the syntax of TypeScript, so only real `defineEvent`, `emit()` and `defineListener` calls count. `--json` prints `{ "events": [{ "name", "source", "emitters", "listeners": [{ "name", "sync" }] }] }`.

## Deploy

### `nuxvel server:setup <env>`

```sh
nuxvel server:setup <env> [--dry-run]
```

| Flag | Description |
| --- | --- |
| `--dry-run` | List the changes and make none. |

Sets up the Ubuntu 26.04 server of an environment in `nuxvel.deploy.ts` over SSH as `root`. It installs and configures:

- the deploy user, SSH with keys only, fail2ban, the firewall, security updates, UTC and swap.
- Node.js (the major of `.nvmrc`), pm2, Caddy, Postgres, two Redis instances and SeaweedFS.
- the recovery key, the nightly backup timer and `/usr/local/lib/nuxvel/backup`.
- rclone and `/etc/nuxvel/offsite.env`, when the environment sets `backups.offsite`.
- the monitor, which checks the server and its apps every minute and sends the alerts of `alerts`, and its Prometheus metrics on `127.0.0.1:9470`.
- Vector, when the environment sets `logs.sink`.
- the server registry `/srv/nuxvel/server.json`, and `/usr/local/lib/nuxvel/caddy-site`, which writes the Caddy site of an app.

It runs again safely: a second run changes nothing.

The command stops when:

- the app has no `.nvmrc` with a Node.js version.
- the server runs a higher Node.js major than `.nvmrc`.
- the server is not of the `arch` in `nuxvel.deploy.ts`.

With `backups.offsite`, it writes a file to the off-site bucket and deletes it, to check the credentials. It also tries once to turn on versioning of the bucket, and warns when the bucket cannot keep versions.

The first run pins the server's SSH host key in `.nuxvel/known_hosts` and prints its SHA-256 fingerprint. Commit that file: later runs, the other commands and CI refuse a server whose key changed. The first run also shows the recovery key one time. It asks until you confirm that you stored the recovery key and the off-site credentials outside the server, so it needs a terminal. Each run ends with the `/api/health/ready` URL of each domain, to add to an external uptime service. See [Deploying to a VPS](./deploy.md#setting-up-the-server).

### `nuxvel app:create <env>`

```sh
nuxvel app:create <env> [--dry-run]
```

| Flag | Description |
| --- | --- |
| `--dry-run` | List the changes and make none. |

Creates the app's resources on the server of an environment over SSH as `root`, after `server:setup`: the folder `/srv/apps/<app>/` with `releases/`, `shared/`, and `state.json`, and the folder `/srv/nuxvel/assets/<app>/_nuxt/` that only root writes and Caddy reads, a free block of 20 ports on localhost (blue and green halves), the pm2 names, and a database with an owner role and a runtime role whose URLs go in `shared/owner.env` and `shared/.env`, a Redis user on both instances limited to the keys under `<app>:` (its URLs and `NUXT_REDIS_PREFIX` go in `shared/.env`), a private and a public bucket with their own S3 keys (`NUXT_STORAGE_URL` and `NUXT_STORAGE_BUCKET` go in `shared/.env`), a random `NUXT_AUTH_SECRET` and `NUXT_AUDIT_CHAIN_SECRET`, a daily timer for the maintenance entry, and with `backups.restoreDrill` a weekly timer for the restore drill, recorded in `/srv/nuxvel/server.json` with the environment's `domains`, `redirects` and `filesDomain` (which also sets `NUXT_STORAGE_PUBLIC_URL`). It runs again safely: a second run changes nothing. See [Deploying to a VPS](./deploy.md#creating-the-app-on-the-server).

### `nuxvel deploy <env>`

```sh
nuxvel deploy <env> [--artifact=<file>] [--force]
```

| Flag | Description |
| --- | --- |
| `--artifact` | An archive from `nuxvel build --artifact` to deploy. Without it, the deploy builds one for `linux/<arch>` of the environment with Docker Buildx, from a clean git tree whose commit is pushed. |
| `--force` | Build and deploy a git tree with uncommitted changes or an unpushed commit. Without it, such a tree stops the deploy. |

Deploys the app to the server of an environment over SSH as the deploy user. It checks the archive's checksum and that its build manifest is for Linux on the environment's `arch`, takes the deploy lock `deploy.lock` (it stops when another deploy holds it), checks the build manifest against the server (glibc, the server's Node.js major) and `shared/.env` against the server's boot checks, uploads the archive and extracts it into `releases/<UTC time>-<commit>/` with a link to `shared/.env`, copies the hashed assets into `/srv/nuxvel/assets/<app>/_nuxt/` with the root script `assets`, and runs the release's migrations as the owner role. Then it starts the idle color's web processes, checks `/api/health/ready` and each `deploy.smoke` path, starts the new workers and stops the old ones, points the Caddy site at the new color, links `current` and writes `state.json`. When a check fails, the live color keeps serving. Then it holds the old color for `deploy.hold` seconds while it watches the new one (readiness, and 5xx answers in Caddy's access log), switches back and alerts `alerts.webhook` when the new one fails, and otherwise retires the old color, keeps the newest `keepReleases` releases that finished their hold (deleting the others, such as a failed release) and deletes unused assets older than 7 days. The first deploy of an app runs `app:create` first, before the checks against the server.

With `deploy: { strategy: "rolling" }`, the deploy does not start a second color. It replaces the processes of the live color one at a time: first the workers, then each web process. With the default `blue-green` strategy, the deploy also changes to rolling when a second color of the app does not fit in the memory of the server, and prints `▲ A second color of <app> does not fit in the memory of <host>: replacing its processes one at a time`. The migrations, the checks and the watch are the same. When a check or the watch fails, the live color goes back to the previous release. See [Rolling deploys](./deploy.md#rolling-deploys).

When the release has contract migrations that the deploy cannot apply yet, it ends with a warning and the hint to run `nuxvel db:contract <env>`. It also warns when the environment has no `backups.offsite`. See [Deploying to a VPS](./deploy.md#deploying).

### `nuxvel make:ci`

```sh
nuxvel make:ci <env> [--force]
```

| Flag | Description |
| --- | --- |
| `--force` | Overwrite an existing `.github/workflows/deploy.yml`. |

`nuxvel make:ci` writes a GitHub Actions workflow to `.github/workflows/deploy.yml` that tests, checks and builds each push to `main`, then deploys it to the environment `<env>` of `nuxvel.deploy.ts`. The build runs on a runner of the environment's `arch`. See [Deploying to a VPS](./deploy.md#deploying-from-github-actions).

### `nuxvel release:list <env>`

```sh
nuxvel release:list <env> [--json]
```

Lists the releases of the app on the server of an environment, newest first: the release, its commit and build source from its build manifest, its deploy time and the colors that run it (`(live)` for the live one). `--json` prints `{ "releases": [{ "name", "commit", "source", "colors", "live", "deployedAt" }] }`. See [Deploying to a VPS](./deploy.md#releases-and-the-deploy-lock).

### `nuxvel deploy:unlock <env>`

```sh
nuxvel deploy:unlock <env> [--force]
```

| Flag | Description |
| --- | --- |
| `--force` | Remove the lock without asking. |

Removes the deploy lock that a stopped deploy left on the server. It first shows who holds the lock and its age, and asks for a confirmation: when that deploy still runs, two deploys can then run their migrations at the same time. Without a terminal, it stops unless you pass `--force`. It refuses while a deploy is in its hold, and gives the hint to end the hold with `nuxvel rollback <env>`. When the app has no deploy lock, it says so and exits `0`. See [Deploying to a VPS](./deploy.md#releases-and-the-deploy-lock).

### `nuxvel db:contract <env>`

Applies the deferred [contract migrations](./database.md#contract-migrations) of the live release over SSH as the deploy user, with the release's `migrate.mjs`, and records them in `state.json`. It takes the deploy lock, and refuses while the other color still runs an older release. A contract migration that waits on a backfill stays deferred. The command prints how many wait, and the hint to run it again after the backfill completes. When no contract migration is deferred, it says so and exits `0`. See [Deploying to a VPS](./deploy.md#contract-migrations).

### `nuxvel rollback <env> [release]`

```sh
nuxvel rollback <env> [release] [--force]
```

| Argument or flag | Description |
| --- | --- |
| `release` | A release on the server to put back, such as `20260927T100000Z-abc1234`. The default is the release before the live one. |
| `--force` | Roll back to a release older than an applied contract migration. |

Puts the app back on an earlier release over SSH as the deploy user. During the hold of a deploy, it switches Caddy back to the held color and restarts its workers. After a rolling deploy, it puts the previous release back on the live color. During a hold, it refuses a named release, because the hold keeps the deploy lock. End the hold first with `nuxvel rollback <env>`.

After the hold, it deploys the release before the live one, or the named release, without migrations. It uses the same checks and hold as `nuxvel deploy`. It deploys to the idle color, or, with a rolling deploy, it replaces the processes of the live color one at a time. It refuses a release that is not on the server, and the live release. It never undoes a migration. It refuses a release older than an applied contract migration, unless you pass `--force`. It ends with the number of jobs in the failed lists and the hint to run `nuxvel queue:retry` after the next deploy. See [Deploying to a VPS](./deploy.md#rolling-back).

### `nuxvel app:rotate-credentials <env>`

Gives the app new credentials over SSH as `root`: a new password for the owner database role, a new runtime login role with the data rights of `<app>_app`, a second password on each Redis user and a second S3 key, all written to `shared/`. The owner password changes at once. Then it deploys the live release again with the new credentials, like `nuxvel deploy`. After the hold of that deploy, it revokes the old credentials, so they no longer connect. When the deploy fails, the old and the new credentials both still work: run the command again. It refuses an app with no live release. See [Deploying to a VPS](./deploy.md#rotating-credentials).

### `nuxvel app:destroy <env>`

Removes the app and its data from the server of an environment over SSH as `root`, after you type the app name: first its pm2 processes and a final backup in `/srv/nuxvel/backups/<app>/`, encrypted to the recovery key (the database dump, the files of both buckets, `shared/` and the app's registry entry), then its Caddy site, maintenance and restore drill timers, database and roles (also the login roles of `app:rotate-credentials`), Redis users and keys, buckets and S3 user, folder, backup and restore drill status (`/srv/nuxvel/backup-status/<app>.json` and `<app>.drill.json`), nightly backups (it keeps the final backups and the off-site copies) and registry entry. Another answer cancels it. Without a terminal, it stops and changes nothing. See [Deploying to a VPS](./deploy.md#destroying-the-app).

## Operations

### `nuxvel env:pull <env>`

Copies `shared/.env` of the app on the server of an environment to `.nuxvel/<env>.env` (mode 600, git-ignored), over SSH as the deploy user, and writes the file's SHA-256 hash to `.nuxvel/<env>.env.pulled` for `env:push`. See [Deploying to a VPS](./deploy.md#the-server-environment-file).

### `nuxvel env:push <env>`

Checks `.nuxvel/<env>.env` against the server's boot checks, then uploads it as `shared/.env` of the app over SSH as the deploy user. It lists the variables that it sets and removes, by name, as `~ set <NAME>` and `~ remove <NAME>`. Then it writes the hash of the new file to `.nuxvel/<env>.env.pulled`.

It uploads nothing when:

- `.nuxvel/<env>.env` does not exist. Run `nuxvel env:pull <env>` first.
- the file has a quoted value. Write each line as `KEY=value`.
- a boot check fails.
- the server's file changed after the last `env:pull`, for example by `app:rotate-credentials`, or no `env:pull` wrote `.nuxvel/<env>.env.pulled`.
- a deploy holds the lock.
- the file is the same as the server's file. Then it says so and exits `0`.

Each process reads the file when it starts. So the next deploy starts all processes with it, and a process that pm2 restarts before then (after a crash or a reboot) also reads it. See [Deploying to a VPS](./deploy.md#the-server-environment-file).

### `nuxvel logs <env>`

```sh
nuxvel logs <env> [--worker] [--caddy] [--lines=50]
```

| Flag | Description |
| --- | --- |
| `--worker` | Stream the logs of the live workers instead of the web processes. |
| `--caddy` | Stream Caddy's JSON access log of the app instead. |
| `--lines` | How many earlier lines to print first. The default is `50`. |

Streams the logs of the app's live web processes on the server of an environment over SSH as the deploy user, until you stop it with Ctrl-C. `--worker` together with `--caddy`, or a `--lines` value that is not a number, is a usage error (exit code `2`). See [Deploying to a VPS](./deploy.md#logs-status-and-a-shell).

### `nuxvel status <env>`

```sh
nuxvel status <env> [--json]
```

Shows the app on the server of an environment over SSH as the deploy user: its live release and color, whether `/api/health/ready` answers, its last backup and its last off-site upload, and each pm2 process with its status, memory, restarts and uptime. It warns when the environment has no `backups.offsite`, or when the last off-site upload failed. `--json` prints `{ "color", "release", "health", "backup", "processes" }`, where `backup` includes `offsite`. See [Deploying to a VPS](./deploy.md#logs-status-and-a-shell).

### `nuxvel ssh <env>`

Opens a shell as the deploy user in the app's folder `/srv/apps/<app>/` on the server of an environment, with the pinned host key of `.nuxvel/known_hosts`. It exits with the shell's exit code. See [Deploying to a VPS](./deploy.md#logs-status-and-a-shell).

### `nuxvel server:status <env>`

```sh
nuxvel server:status <env> [--json]
```

Shows the server of an environment over SSH as `root`: disk use, memory and swap, whether Postgres, both Redis instances, SeaweedFS, Caddy and pm2 answer, each app with its live release, process count, memory against its share and last backup, and the statements that average 500 ms or more (from `pg_stat_statements`) with the last lines of the slow-query log. It warns when the apps' processes need more memory than the apps' share, when their database pools during a deploy do not fit the Postgres connection limit, when the disk is 80% full or more, or when a service does not answer. The warnings do not change the exit code. `--json` prints the same with `warnings`. See [Deploying to a VPS](./deploy.md#logs-status-and-a-shell).

### `nuxvel server:upgrade <env>`

```sh
nuxvel server:upgrade <env> [--reboot]
```

| Flag | Description |
| --- | --- |
| `--reboot` | Reboot the server when an update needs it. The apps are down until the server is back. |

Installs the waiting security updates on the server of an environment over SSH as `root`, also the updates that need a new package, such as a kernel. It stops when `server:setup` did not set up the server. Then it restarts each service that still uses an old library (as `needrestart` finds them), except pm2 (the app processes pick up a new Node.js on the next deploy) and the services that are not safe to restart, such as `dbus` (they pick up the update with the next reboot). A restart of Postgres, Redis or Caddy stops it for a few seconds. When an update needs a reboot, it names the packages and gives the hint to run it again with `--reboot`. With `--reboot`, it reboots the server 5 seconds after the SSH session ends. With no update to install, it prints `✔ root@<host> has no security update to install`. A Postgres major upgrade stays a manual step. See [Deploying to a VPS](./deploy.md#security-updates).

## Backups

### `nuxvel db:backup <env>`

Backs up the app on the server of an environment now, over SSH as `root`, as the nightly timer does: a `pg_dump` of its database, a sync of its buckets and a config bundle encrypted to the recovery key, in `/srv/nuxvel/backups/<app>/`, keeping the newest backup of each of the last 7 days, 4 weeks and 12 months. With `backups.offsite`, it uploads the backup to that bucket, with the dump encrypted, and fails when the upload fails. See [Deploying to a VPS](./deploy.md#backups).

### `nuxvel db:restore <env>`

```sh
nuxvel db:restore <env> [--from=latest|<time>] [--to=<url>]
```

| Flag | Description |
| --- | --- |
| `--from` | The backup to restore: `latest` (the default) or its time, e.g. `20260927T020312Z`. |
| `--to` | A Postgres URL of an empty database to restore into, instead of a new database on the server. |

Restores a backup of the app's database on the server of an environment over SSH as `root`, into a new database `<database>_restored_<time>` by default, and checks the migrations table and the row count of each table against the counts recorded at the backup. Then it erases again the users erased since the backup, from the server's erasure log. When a step fails, it drops the new database and exits `1`. It does not drop the database of `--to`: the hint says to empty it or drop it. The live database is untouched. A `--from` value that is not `latest` or a backup time is a usage error (exit code `2`). See [Deploying to a VPS](./deploy.md#restoring-a-backup) and [Erasures and restores](./deploy.md#erasures-and-restores).

### `nuxvel server:restore <env>`

```sh
nuxvel server:restore <env> [--from=latest|<time>|<env>:<latest or time>]
```

| Flag | Description |
| --- | --- |
| `--from` | The backups to restore: `latest` (the default) or a time, such as `20260927T020312Z`. `<env>:<latest or time>`, such as `production:latest`, rehearses the restore of that environment instead. Another value is a usage error (exit code `2`). |

Rebuilds a lost server of an environment from its off-site backups, over SSH as `root`. It stops when the environment has no `backups.offsite`. It asks for the recovery key, or reads `NUXVEL_RECOVERY_KEY`. Without a terminal, it needs `NUXVEL_RECOVERY_KEY`. Then it installs the public key of the recovery key and runs `server:setup`. Then it recreates each app in the off-site bucket from its newest backup, or from the backup of `--from`: its registry entry and ports, `shared/`, roles, Redis users and buckets, its database, the files of its buckets and its live release, which it starts after it erases again the users erased since the backup. It skips an app that is not in the server registry of the newest config bundle in the bucket (an app destroyed before). The files of the buckets always come from the newest backup, also with `--from=<time>`. It refuses an app that is live on the server, and a server whose `/etc/nuxvel/recovery.pub` holds another key. Run it again after a failure: it drops the database of an app that is not live yet and restores it again. See [Deploying to a VPS](./deploy.md#restoring-a-lost-server).

With `--from=<env>:<latest or time>`, such as `server:restore staging --from=production:latest`, it rehearses instead: it restores that environment's backup into a temporary `<app>-rehearsal` next to the app on this server, starts it without workers and with outgoing mail off, times each step, and removes it. The source environment must have `backups.offsite`. The command records the rehearsal in `.nuxvel/rehearsals.json`. Commit that file: `nuxvel doctor` warns when the last rehearsal of an environment is older than 90 days. See [Rehearsing a restore](./deploy.md#rehearsing-a-restore).

### `nuxvel dr:check <env>`

Checks over SSH as `root` that the recovery key is the server's key. It also checks that the key decrypts the newest config bundle of the app, on the server and in the off-site bucket. It asks for the key, or reads `NUXVEL_RECOVERY_KEY`. Without a terminal, it needs `NUXVEL_RECOVERY_KEY`. It exits `1` when:

- the key is not the server's key.
- the key does not decrypt a config bundle.
- it cannot read the off-site bucket, or the bucket has no config bundle of the app.
- the app has no config bundle on the server or off-site. The hint is to make one with `nuxvel db:backup <env>`.

See [Deploying to a VPS](./deploy.md#checking-the-recovery-key).

## Monitoring

### `nuxvel alerts:test <env>`

Sends a test alert from the server of an environment, over SSH as `root`, through each channel of `alerts` that `server:setup` stored (email, webhook and heartbeat URL), and reports each one. It exits `1` when a channel fails or no channel is set. When the monitor on the server is too old to send a test alert, it sends nothing and exits `1`: run `server:setup` to update the monitor. See [Deploying to a VPS](./deploy.md#alerts).

## Build

### `nuxvel build`

```sh
nuxvel build --image=<name:tag> [--platform=<platforms>] [--push]
nuxvel build --artifact [--platform=<platforms>] [--format=tar|zip]
```

| Flag | Description |
| --- | --- |
| `--image` | The name and tag of the Docker image, for example `registry.example.com/app:1.4.0`. |
| `--push` | Push the image to its registry, not into the local Docker. |
| `--artifact` | Build an archive in `dist/`, not an image. |
| `--format` | The archive format for `--artifact`: `tar` (the default, `.tar.gz`) or `zip`. |
| `--platform` | Docker platforms, separated by commas. The default is the Linux platform of this machine, for example `linux/arm64`. |

`nuxvel build` builds the app in Linux containers with Docker Buildx. See [Building for production](./build.md).

```sh
nuxvel build --platform=linux/amd64,linux/arm64 --image=registry.example.com/app:1.4.0 --push
nuxvel build --artifact   # dist/<app>-<version>-linux-<arch>.tar.gz + .sha256
```

Buildx shows its own output while it runs. Then each build ends as a step with its duration. An image is one step for all of its platforms:

```
◇  Built registry.example.com/app:1.4.0 for linux/amd64, linux/arm64 (123.4s)
└  Pushed registry.example.com/app:1.4.0
```

Without `--push`, the last line is `Loaded <image> into Docker`. With `--artifact`, each platform is one step, and each archive shows on stdout:

```
◇  Built linux/arm64 (123.4s)
└  1 archive in dist/
✔ Built dist/app-1.4.0-linux-arm64.tar.gz
```

The command needs an image or an archive. With neither, it exits `2` with `✖ Nothing to build`. `--image` or `--push` with `--artifact`, `--format` without `--artifact`, and an unknown format are usage errors too. When Docker is not installed, the command says so and exits `1`.

### `nuxvel build:manifest`

```sh
nuxvel build:manifest
```

`nuxvel build:manifest` writes `nuxvel-manifest.json` for the build in the current directory. The manifest records the app, the commit and the machine that built it. The Dockerfile runs this command after `nuxt build`.

```
✔ Wrote nuxvel-manifest.json: node 24.8.0 linux/arm64 glibc
```

When `nuxvel.perf.bundle.maxInitialKb` is set, the command first prints the gzipped initial JavaScript and CSS of each page. It exits `1` when a page is over the budget. See [Build: bundle budget](./build.md#bundle-budget).

### `nuxvel build:verify <archive>`

```sh
nuxvel build:verify dist/app-1.4.0-linux-arm64.tar.gz [--json]
```

`nuxvel build:verify` checks an archive before you run it on a machine. It checks the `.sha256` checksum first. Then it checks that the manifest matches the platform, CPU architecture, C library and Node major version of the current machine. When a check fails, the command lists the problems and exits `1`.

`--json` prints `{ "archive", "ok", "manifest" }`, or `{ "archive", "ok": false, "problems" }`.

## Maintenance

### `nuxvel down`

```sh
nuxvel down [env] [--message <text>] [--retry <seconds>] [--secret <token>] [--allow <ip>]... [--keep-queue] [--force]
```

| Flag | Description |
| --- | --- |
| `--message` | The text of the maintenance page and of the 503 responses. |
| `--retry` | The seconds in the `Retry-After` header. The default is `60`. |
| `--secret` | A token of at least 8 letters, digits, `-` or `_`. A browser that opens `/<secret>` gets access. |
| `--allow` | An IP address that keeps full access. Repeat the flag for more addresses. |
| `--keep-queue` | Do not pause the queue. |
| `--force` | With an environment, run it on the server without the question. |

```sh
nuxvel down --message "Upgrading the database" --retry 120 --secret deploy-2026-09
# ✔ The app is down for maintenance, the queue is paused
#   → Bypass it at /deploy-2026-09
```

`nuxvel down` puts the app in maintenance mode. It writes the state to Redis, so every web server and every worker sees it at the same time. It also pauses the queue, unless you pass `--keep-queue`. While the app is down, each request gets a `503` response, except for the health endpoints, the bypass and the allowed IP addresses. Run the command again to change the message or the other settings. See [Maintenance mode](./maintenance.md).

A `--retry` that is not a whole number of at least 1, a `--secret` with other characters, or an `--allow` that is not an IP address is a usage error (exit `2`).

With an environment, such as `nuxvel down production`, the command runs on the server of that environment instead, over SSH as the deploy user, in the live release with `shared/.env`. Both colors use the same Redis, so all of them go down. It asks first. `--force` skips the question. Without a terminal, the command refuses unless you pass `--force`. See [Maintenance mode on a VPS](./maintenance.md#on-a-vps).

### `nuxvel up`

```sh
nuxvel up [env] [--force]
# ✔ The app is up, the queue runs again
```

`nuxvel up` takes the app out of maintenance mode and resumes the queue. When the app is not down, it prints `✔ The app was not down` and exits `0`. With an environment, it runs on the server of that environment and asks first, as `nuxvel down <env>` does.

### `nuxvel maintenance:status`

```sh
nuxvel maintenance:status [env] [--json]
```

```
STATE  SINCE                     RETRY  BYPASS  ALLOW        QUEUE   MESSAGE
down   2026-09-25T07:00:00.000Z  120s   secret  203.0.113.7  paused  Upgrading the database
```

`nuxvel maintenance:status` shows whether the app is in maintenance mode. An app that is up shows `up` and the state of the queue. With an environment, it reads the state of the app on the server of that environment, over SSH, with no question.

`--json` prints `{ "down": true, "message", "retryAfter", "since", "allow", "bypass", "queuePaused" }`, or `{ "down": false, "queuePaused" }`. `bypass` tells if a secret is set. The secret itself is never printed.

## Secrets

### `nuxvel key:generate`

```sh
nuxvel key:generate
```

`nuxvel key:generate` writes a strong random `NUXT_AUTH_SECRET` into the `.env` at the app root. It creates the file if it does not exist.

When `.env` already sets `NUXT_AUTH_SECRET` to a value that is not empty, the command does not overwrite it. It exits `1` and points at `nuxvel key:rotate NUXT_AUTH_SECRET` to replace the secret.

### `nuxvel key:rotate <name>`

```sh
nuxvel key:rotate <name> [--value <value> | --stdin]
```

`nuxvel key:rotate` rotates a secret in `.env`. The named variable gets a new strong value, its old value moves to `<name>_PREVIOUS`, and `<name>_PREVIOUS_EXPIRES_AT` gets a timestamp 30 days later.

```sh
nuxvel key:rotate NUXT_AUTH_SECRET
```

```
NUXT_AUTH_SECRET=<new secret>
NUXT_AUTH_SECRET_PREVIOUS=<old secret>
NUXT_AUTH_SECRET_PREVIOUS_EXPIRES_AT=2025-10-19T09:00:00.000Z
```

nuxvel signs new sessions with the new secret. Sessions signed with the old secret continue to verify until that timestamp, so a rotation signs nobody out. Two-factor sign-in continues to work too. `NUXT_AUTH_SECRET` encrypts the TOTP secret and the backup codes of each user. During the grace period, nuxvel decrypts them with the new or the previous secret. The built-in schedule `nuxvel.auth.reencrypt-two-factor` runs every day at 04:15 in `nuxvel queue:work` and encrypts them again with the new secret. To do this now, run `nuxvel schedule:run nuxvel.auth.reencrypt-two-factor` after the server restarts. Make sure the schedule ran before the grace period ends and before the next rotation. If it did not, users who turned on two-factor sign-in before the rotation cannot sign in. A secret that your own code reads through `useSecrets(name)` rotates the same way. See [Security](./security.md#rotating-secrets). Remove the two `_PREVIOUS` variables after the grace period.

For a secret that another party issues, such as the webhook signing secret of a payment provider, give the new value. Pass it with `--value`, or on stdin with `--stdin` to keep it out of your shell history:

```sh
nuxvel key:rotate NUXT_BILLING_WEBHOOK_SECRET --value whsec_...
pbpaste | nuxvel key:rotate NUXT_BILLING_WEBHOOK_SECRET --stdin
```

The command exits `1` when `.env` does not set the variable. Run `key:generate` first for `NUXT_AUTH_SECRET`. It also exits `1` when the new value is empty or has more than one line. It exits `1` for `NUXT_AUDIT_CHAIN_SECRET` and `NUXT_OG_IMAGE_SECRET`, which cannot rotate.

### `nuxvel key:push`

```sh
nuxvel key:push
# ✔ Wrote NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY and NUXT_PUSH_VAPID_PRIVATE_KEY to .env
```

`nuxvel key:push` writes a new VAPID key pair for web push into the `.env` at the app root. It creates the file if it does not exist. The public key goes to `NUXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY` and the private key to `NUXT_PUSH_VAPID_PRIVATE_KEY`. See [Progressive web app](./pwa.md#vapid-keys).

When `.env` already sets one of the two keys, the command does not overwrite it and exits `1`. New keys end every push subscription, so the command does not rotate keys. To replace them, delete both lines from `.env` first.

## API keys

### `nuxvel key:issue <userId> --name <name>`

```sh
nuxvel key:issue 5b1c… --name ci
# nxk_3q2x…
# ✔ Issued the API key "ci" for user 5b1c…. Store it now: it is not shown again
```

`nuxvel key:issue` issues an [API key](./openapi.md#api-keys) that acts for the user with the ID `userId`. It prints the key to stdout, once. nuxvel stores only its hash, so no command can show it again. The key does not expire. Revoke it with the `apiKeys.revoke` procedure. A password reset or a password change of the user also deletes it. When no user has that ID, the command exits `1`.

## See also

- [Building for production](./build.md)
- [Database](./database.md)
- [Queues](./queues.md)
- [Maintenance mode](./maintenance.md)
- [Testing](./testing.md)
- [Security](./security.md)
