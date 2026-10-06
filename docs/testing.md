# Testing

## Introduction

nuxvel apps have three layers of tests. Each layer checks one thing, and a check goes in the one layer that owns it.

| Layer | Runs in | What it checks | Where it lives |
|---|---|---|---|
| Functional | Vitest, a real Postgres database, the app server of the test file | Server behavior: the result or error of a procedure, the rows, the jobs, the mail, the status and `location` of a response, and the head tags that `getMeta()` returns. It does not check the HTML or the text of a page. | `tests/functional/`, or `*.test.ts` next to the server file |
| Component | Vitest browser mode, one story in headless Chromium, MSW instead of the server | The states of one component, with `mockTrpc`, `mockUser` and `trpcSpy` | `*.stories.ts` next to the component |
| End-to-end | Vitest and Playwright, a real server, a real database | A journey across pages, with real auth | `tests/e2e/` |

There is no separate unit-test layer. When you do not know where a check goes, ask what it needs. If it needs a database row, a job or a mail, it is functional. If it needs one component in one state and no server, it is a component test. If it needs more than one page or a real session, it is end-to-end.

Each layer has one `expect`. A functional test and an end-to-end test import it from `@nuxvel/nuxt/testing`. A story imports it from `@nuxvel/nuxt/storybook/test`. See [expect](#expect). Each layer has a helper table, [Find elements](#find-elements) for the browser and [Component tests](#component-tests) for stories. `trpcSpy` exists in both browser layers, with the same assertions. See [tRPC calls](#trpc-calls). A test that waits on timers, types or hovers has a form in each browser layer, see [Typing, timers and hover](#typing-timers-and-hover). A test that repeats with other data uses `it.for`, see [Many cases in one test](#many-cases-in-one-test).

The same check in two layers. The end-to-end test deletes a post with the real server. The `play` function gives the component a spy for `post.delete`, and checks the call:

```ts
// tests/e2e/posts.test.ts
const page = await actingAs(await userFactory()).visit("/posts");
await button(page, "Delete My post").click();
await button(dialog(page, "Delete post?"), "Delete").click();
await expect(alert(page)).toHaveText("Post deleted");
```

```ts
// app/components/PostRow.stories.ts
const remove = trpcSpy("post.delete", () => undefined);

export const Deletes: StoryObj<typeof meta> = {
  parameters: { msw: [mockTrpc({ post: { delete: remove } })] },
  play: async () => {
    await button(page, "Delete My post").click();
    await button(dialog(page, "Delete post?"), "Delete").click();
    await expect(remove).toHaveBeenCalledWith({ id: 1 });
  },
};
```

Every fixture on this page comes from `@nuxvel/nuxt/testing`. The examples use a blog with posts, authors and comments.

## Running tests

```bash
nuxvel test
nuxvel test tests/functional/posts.test.ts
```

A new app has one script for each layer:

| Script | Runs |
|---|---|
| `npm test` | `test:functional`, then `test:ui` |
| `npm run test:functional` | `nuxvel test`: the functional tests |
| `npm run test:ui` | `nuxvel test:ui`: the stories of `app/`, as [component tests](#component-tests) |
| `npm run test:e2e` | `nuxvel test:e2e`: the [end-to-end tests](#end-to-end-tests) in `tests/e2e/` |
| `npm run test:arch` | `nuxvel test:arch`: the [architecture rules](./cli.md#nuxvel-testarch), including two rules for tests |

`nuxvel test` runs `vitest run --project functional` in the project. It passes every extra argument to Vitest. It leaves out the end-to-end tests and the component tests. `npm test` does not run the end-to-end tests. Run `npm run test:e2e` for them. Only the functional layer takes part in `--changes-only` and `--watch`, see below.

`nuxvel test:arch` reports two kinds of mistake in a test. A functional test must not read the HTML of a page: check it in a story or with `visit()`. A test or a story must not import `expect` from `vitest`, `playwright/test`, `@playwright/test` or `storybook/test`: use the `expect` of its layer.

Before Vitest starts, `nuxvel test` starts the services in the app's `docker-compose.yml` (or `compose.yml`) with `docker compose up -d --wait`. It waits until they report healthy. `nuxvel dev` does the same. When Docker is not installed or `docker compose` fails, the command shows the error and continues. Without a compose file, it starts nothing. When each service is already healthy and was created from the current compose file, it does not run `docker compose up`. A stack created from an older compose file is recreated. When the command ends, Ctrl-C included, it stops the services that it started with `docker compose stop`. Services that were already running stay running.

To keep the services running between test runs, start them once with `nuxvel services up`. Then each run uses them and does not stop them. `nuxvel services status` shows the state of each service, and `nuxvel services down` stops them. See the [CLI reference](./cli.md#nuxvel-services).

### Run only the changed tests

```bash
nuxvel test --changes-only
```

`nuxvel test --changes-only` runs only the test files that your changes since the last `--changes-only` run can affect. It prints the number of test files that it does not run. These files keep the result that they had in the last run:

```
◇ Test files replayed as passed: 41. Test files to run: 2.
```

When it must run all test files, it prints the reason, for example `◇ Run all test files: server/utils/slug.ts changed and no test ran it`.

#### How the selection works

Each `--changes-only` run records a map in `node_modules/.cache/nuxvel/changes.json`. A plain `nuxvel test` run does not change it. For each test file, the map lists the project files that the test file ran:

- the modules that the test process loaded, such as test helpers and `shared/` code
- the app files with at least one function that ran in the server that `@nuxvel/nuxt/testing/setup` started for the file. The reporter reads the V8 coverage of the server and finds each file through the source maps of the test build.

The map does not include files in `node_modules`. The record also has the SHA-1 hash of each project file and the test files that failed. The hashes do not include `node_modules`, `dist` and the folders whose names start with `.`. nuxvel does not use git.

The next run hashes the project files again. A file is changed when its hash is different, when it is new or when it is deleted. Changes in `tests/e2e/` do not count. Then nuxvel applies these rules, in this order:

1. When `CI` is set, or there is no record, run all test files.
2. When a config file changed, run all test files. The config files are `nuxt.config.ts`, `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `vitest.config.ts`, `tsconfig.json` and `.env` at the project root. A file in `tests/setup/` and a migration in `server/database/migrations/` also count.
3. When a changed file is not a test file and no test file ran it, run all test files. This includes a new app file, `README.md` and a log file in the project.
4. Otherwise, run these test files: the test files that changed or are new, the test files that ran a changed file, and the test files that failed in the last run.

After a run of some test files, the record keeps the map entries and the failures of the test files that did not run.

#### Known misses

The selection is only as good as the map. These cases can give a wrong selection:

- An edit to `app/pages/index.vue` runs all test files when no functional test file renders the page (rule 3).
- The map records a file only when a function in it ran. A test that only reads a top-level constant of a file does not record that file. When you change the constant, that test file does not run, unless rule 3 applies.
- The map records only code that ran in Node. Code that runs only in the browser, such as an `onMounted` hook or a client plugin, is not in the map. A change to it can skip the tests that check it.

Run the full `nuxvel test` before you merge. CI always runs all test files.

### Watch mode

```bash
nuxvel test --watch
```

`nuxvel test --watch` does the steps of [`--changes-only`](#run-only-the-changed-tests), then watches the project files. It does not watch `node_modules`, `dist` and the folders whose names start with `.`. When a file changes, the command selects the test files with the same rules and runs them. Each run updates the record. The test build stays in the cache, so a run builds the app again only when the build key changes. An atomic save (`sed -i` and many editors write a temporary file and rename it) sends more than one file event, so the command waits 100 ms after the last event before it starts a run. A new run starts only after the current run ends. Push Ctrl-C to stop the command.

## The test database

A new app has a `tests/setup/database.ts` global setup. At the start of every run, it does these steps:

1. Loads `.env`, if the file exists.
2. Reads `NUXT_DATABASE_OWNER_URL`. It throws when the variable is not set.
3. Drops the `<database>_test` database and creates it again. For `postgres://…/nuxvel`, the test database is `nuxvel_test`.
4. Runs the migrations in `server/database/migrations`, and then the contract migrations in its `contract/` folder.
5. Points `NUXT_DATABASE_URL` and `NUXT_DATABASE_OWNER_URL` at the test database for the rest of the run.

You do not run `nuxvel db:migrate` for tests.

The test database stays after the run, until the next run drops it. To look at the rows that the last run left, connect to it with the `NUXT_DATABASE_OWNER_URL` from `.env`, with `_test` added to the database name.

## Vitest configuration

```ts
// vitest.config.ts
import { configDefaults, defineConfig, type TestProjectInlineConfiguration } from "vitest/config";

async function ui(): Promise<TestProjectInlineConfiguration> {
  const { storybookTest } = await import("@storybook/addon-vitest/vitest-plugin");
  const { playwright } = await import("@vitest/browser-playwright");
  return {
    plugins: [storybookTest({ configDir: ".storybook" })],
    test: {
      name: "ui",
      browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: "chromium" }] },
    },
  };
}

const wantsUi = process.env.NUXVEL_TEST_UI === "1" || process.env.VITEST_STORYBOOK === "true";

export default defineConfig(async () => {
  if (wantsUi) return { test: { projects: [await ui()] } };

  return {
    test: {
      environment: "node",
      globalSetup: ["./tests/setup/database.ts", "@nuxvel/nuxt/testing/global-setup"],
      setupFiles: ["@nuxvel/nuxt/testing/database", "@nuxvel/nuxt/testing/setup"],
      hookTimeout: 180000,
      testTimeout: 30000,
      provide: { nuxvelBrowserTimeout: 5000 },
      projects: [
        {
          extends: true,
          test: { name: "functional", exclude: [...configDefaults.exclude, "**/tests/e2e/**"] },
        },
        {
          extends: true,
          test: { name: "e2e", include: ["**/tests/e2e/**/*.test.ts"] },
        },
      ],
    },
  };
});
```

A new app ships with this file.

The config has one Vitest project for each kind of test. `nuxvel test` runs `vitest run --project functional`, `nuxvel test:e2e` runs `vitest run --project e2e`, and `nuxvel test:ui` runs `vitest run --project ui`. A project owns the test files that its `include` and `exclude` globs match, so an end-to-end test in any `tests/e2e/` folder, such as `layers/billing/tests/e2e/`, runs under `test:e2e` and never under `nuxvel test`. `extends: true` gives each project the options above it. A project is a name and a set of globs, so a new kind of test is a new entry in `projects`. A plain `npx vitest run` runs every project.

When `NUXVEL_TEST_UI=1` or `VITEST_STORYBOOK=true`, the config has only the `ui` project. `nuxvel test:ui` sets the first variable, and the test widget of the Storybook UI sets the second. The `ui` project has no global setup, so it needs no database and no test build of the app. `@storybook/addon-vitest` loads the Storybook presets and starts Nuxt, and this adds about 2 s to each run. Thus `nuxvel test`, `--changes-only` and `--watch` do not load it. The Storybook widget finds the Vitest config only in a file named `vitest.config.*` that contains the text `storybookTest`. Keep the `ui()` function in `vitest.config.ts`.

`@nuxvel/nuxt/testing/global-setup` builds the app for tests before any test file starts. List it after any global setup that sets environment the build reads, such as the database setup.

The build stays in `node_modules/.cache/nuxvel/test/<key>/build`. The next run uses it again while the app's inputs do not change. The inputs are:

- the resolved Nuxt config
- the files of the app and of each local layer, `server/`, `app/` and `public/` included. In a git repository, only the files that git tracks or does not ignore are inputs, so a scratch file that `.gitignore` lists does not start a new build. Outside a git repository, every file is an input.
- the version of each dependency and the lock file
- the Node version
- `NODE_ENV`, the `VITE_*` variables and each environment variable that the last build read. The setup records the variables that the build reads. A variable that the build does not read, such as a terminal session id or `NUXVEL_CHANGES_DIR`, which `--changes-only` and `--watch` set, is not an input. The key also skips the variables of the shell and of `npm run`, even when the build reads them: `npm_*`, `TERM*`, `COLORTERM`, `TMUX*`, `SSH_*`, `SHLVL` and `PATH`, and the ones a dependency reads to detect an AI agent, such as `AI_AGENT`, `CLAUDECODE` and `EDITOR`. Thus a new terminal, `npm run test`, a coding agent, a `--changes-only` run and a run through the `nuxvel` CLI use the same build.

The test files, `*.md` files and the `test/` and `tests/` folders are not inputs, so a change to a test does not start a new build. The setup keeps the two newest builds. It does not remove a build while a run uses it. The setup prints one of these lines:

```
◇ Using the test build from 26/09/2026, 10:20:43
◇ Built the app for tests: server/utils/slug.ts changed (22.0s)
```

`@nuxvel/nuxt/testing/setup` starts the app for each test file. See [Writing a test](#writing-a-test). It registers the [matchers](#expecting-failures). Before the first test of a file and after every test, it clears what the [fakes](#fakes) recorded. It also removes the values that the test server stored in the [cache](./cache.md#testing), and the cached pages of routes with the `cached` preset. The first reset removes what the start-up of the server recorded.

`@nuxvel/nuxt/testing/database` gives each test file a clean copy of the test database. List it before `@nuxvel/nuxt/testing/setup`. It does these steps:

1. Before the file runs, it copies `<database>_test` to `<database>_test_<VITEST_POOL_ID>`. The copy has the migrated tables.
2. It points `NUXT_DATABASE_URL` and `NUXT_DATABASE_OWNER_URL` at the copy. The file's server uses the copy.
3. After each test, it empties every table in the `public` schema and resets the identity sequences.
4. After the file, it drops the copy.

Thus test files run in parallel, and each test starts with empty tables. After the first test, the setup removes the rows that `beforeAll` makes. Make rows in the test or in `beforeEach`.

The setup also gives each test file its own Redis database. The index is the index in `NUXT_REDIS_URL` plus `VITEST_POOL_ID`. For example, `redis://localhost:6379` gives databases 1, 2, 3 and more. The setup runs `FLUSHDB` on that database before the file and after each test. Thus each test starts with no flag targeting, rate limits, maintenance mode or presence. Redis has 16 databases (0 to 15) by default. If a worker needs a higher index, the setup stops with an error. Start Redis with more databases (`--databases 64`), or set a lower `--maxWorkers`.

Each file starts its own server from the shared build in a second or two.

The test server runs with `NODE_ENV=production`, so it needs `NUXT_SITE_URL`. The setup gives each server a free port and sets `NUXT_SITE_URL` to its address, for example `http://127.0.0.1:24312`. Each Vitest worker takes its ports from its own block of 100 between 20000 and 32000, so two workers never start a server on the same port. Thus the links in the auth mails open on the test server. A `NUXT_SITE_URL` in `process.env`, or a `runtimeConfig.siteUrl` in `nuxt.config.ts`, wins. The server also needs `NUXT_AUDIT_CHAIN_SECRET`. The setup gives it a fixed test value, unless `process.env` sets it.

### Sharding

Sharding divides the test files between machines. Each machine runs one shard. `nuxvel test` gives the `--shard` and `--reporter` options to Vitest:

```bash
npx nuxvel test --shard=1/3 --reporter=blob
```

The `blob` reporter writes the results to `.vitest/blob/`. When all shards are done, put the blob files of each shard in `.vitest/blob/` on one machine. Then merge them into one report:

```bash
npx vitest run --merge-reports
```

This GitHub Actions workflow runs three shards and merges the results:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3]
    env:
      NUXT_AUTH_SECRET: ci-only-auth-secret-not-for-production
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: cp .env.example .env
      - run: npx nuxvel test --shard=${{ matrix.shard }}/3 --reporter=blob
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-${{ matrix.shard }}
          path: .vitest/blob/
          include-hidden-files: true

  report:
    needs: test
    if: ${{ !cancelled() }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          pattern: blob-*
          path: .vitest/blob/
          merge-multiple: true
      - run: npx vitest run --merge-reports
```

Use one shard for each machine. Each shard builds the app for tests, and the test files of a shard already run in parallel. Thus two shards on one machine do the build two times and share the same CPUs.

## Writing a test

```ts
// tests/functional/posts.test.ts
import { actingAs, expect, expectRow } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";
import { postTable } from "#nuxvel/schema";

describe("posts", () => {
  it("creates a post", async () => {
    const { trpc } = actingAs(await userFactory());

    const post = await trpc.post.create({ title: "Hello", body: "" });

    expect(post.title).toBe("Hello");
    await expectRow(postTable, { id: post.id, title: "Hello" });
  });
});
```

Put tests in `tests/functional/`, or next to the server file they cover.

Import tables from `#nuxvel/schema`, factories from `#nuxvel/factories`, server files from `#server/<path>` and shared files from `#shared/<path>`, never through `../`. The `imports` field in the starter's `package.json` maps these specifiers for Vitest, so a test file can import them wherever it is. An app made before 0.3.0 gets the field from [`nuxvel upgrade`](./cli.md#nuxvel-upgrade).

Import `expect` from `@nuxvel/nuxt/testing`, never from `vitest`. It checks a Playwright `Locator` or `Page` with the Playwright `expect`, and any other value with the Vitest `expect`. Import `describe`, `it`, `vi` and the hooks from `vitest`. In a story, import `expect` from `@nuxvel/nuxt/storybook/test`.

A test file does not start the app itself. Before the first test of each file, `@nuxvel/nuxt/testing/setup` starts a server for the file from the run's build. A fixture that reaches the app throws when `@nuxvel/nuxt/testing/global-setup` is not in `globalSetup`.

Set an environment variable on `process.env` at the top level of the file to give it to that file's server at runtime. All files share one build. Set a value that the build reads in `.env` or the shell before the run starts.

The first [`visit()`](#visit) or `createPage()` in a file starts a browser for the file. A file without a page starts no browser. See [End-to-end tests](#end-to-end-tests).

### Generating tests

```bash
nuxvel make:test actions/posts/create-post.action
```

`nuxvel make:test <path>` creates a test next to an existing file under `server/`. The path is relative to `server/`, without the extension. The command above writes `server/actions/posts/create-post.action.test.ts`. The file must exist. Pass `--force` to overwrite a test that already exists.

The folder of the file picks the fixture that the scaffold's `it.todo` names: `runAction()` under `actions/`, the `trpc` caller under `trpc/routers/`, `runJob()` under `jobs/` and `runListener()` under `listeners/`. Pass `--action`, `--router`, `--job` or `--listener` to pick it yourself.

Most `make:*` commands also write a test next to the file they create: `make:action`, `make:job`, `make:event`, `make:listener`, `make:mail`, `make:notification`, `make:backfill`, `make:channel`, `make:webhook`, `make:resource`, `make:router --crud` and `make:factory`. See the [CLI reference](./cli.md).

## Acting as a user

```ts
const author = await userFactory();
const { trpc } = actingAs(author);

const post = await trpc.post.create({ title: "Hello", body: "" });
const posts = await guest().trpc.post.list();
```

`actingAs(user)` returns the ways to reach the app as that user:

| Member | Does |
|---|---|
| `trpc` | a caller for the app's tRPC router |
| `fetch(path, init?)` | sends a request to a server route and returns the `Response` |
| `$fetch(path, options?)` | sends a request to a server route and returns the parsed body, typed by the route |
| `visit(target, options?)` | opens a page in the browser, see [visit](#visit) |
| `login(page)` | signs the user in on a page from `createPage()`, see [login](#login) |
| `upload(name, file)` | uploads a `File` as the upload `name` of `server/uploads/` and returns its `tmp/` key, see [Storage](./storage.md#testing) |
| `listen(channels, { lastEventId? })` | opens a channel stream, with a replay from `lastEventId`, and returns `{ channels, refused, next(event?), close() }`, see [Realtime](./realtime.md#listening-in-a-test) |

`trpc` is typed by the router, so a wrong procedure name or input fails to compile. The caller runs each procedure inside the app with the context a real request gets.

The app loads the user's row by `id`. An `authedProcedure` and a `publicProcedure` see that user as `ctx.user` and `ctx.actor`, role included.

Reach the app through `guest()` and `actingAs(user)`, not through `$fetch`, `fetch` and `createPage` of `@nuxt/test-utils` or `@nuxt/test-utils/e2e`. `npm run test:arch` flags those imports with the rule `nuxvel/test-client`.

`fetch`, `$fetch`, `visit` and `login` send a real session cookie of the user. The app creates the session on the first call, and all of them use the same session. For a user with `twoFactorEnabled`, the session counts as two-factor verified for `adminProcedure`. Use the `twoFactorVerified` option to change this.

```ts
const ada = actingAs(await userFactory());
const post = await ada.trpc.post.create({ title: "Hello", body: "" });

const { unreadCount } = await ada.$fetch("/api/notifications");
const response = await ada.fetch("/api/notifications");
```

`actingAs(user, options)` takes these options:

| Option | Does |
|---|---|
| `headers` | headers that `trpc`, `fetch` and `$fetch` send with each call. A header that a `fetch` or `$fetch` call sets itself wins. `visit` and `login` do not send them |
| `apiKey` | signs each call in with a new API key of the user instead of a session. The result has no `visit` and no `login`. `adminProcedure`, `freshProcedure` and a `roleProcedure` without `{ apiKeys: true }` refuse a key. `twoFactorVerified` has no effect |
| `twoFactorVerified` | whether the session passed a second factor, for `adminProcedure`. Default: `true` when the user has `twoFactorEnabled`. Give `false` to test the refusal |
| `locale` | a locale code of the app, for example `"zh"`. `trpc`, `fetch` and `$fetch` send it as the locale of the page, so `currentLocale()` and `ctx.locale` return it. `visit` opens the page in that locale. See [Internationalization](./i18n.md#the-locale-on-the-server) |

```ts
const ada = actingAs(await userFactory(), { headers: { "Idempotency-Key": "k1" } });
```

Use `headers` for `Idempotency-Key`, for `accept-language`, or for `x-forwarded-for`. `x-forwarded-for` counts only when `nuxvel.security.trustProxy` is set.

`signIn(email, password)` returns the same members on a session from the real sign-in endpoint, see [Users with a password](#users-with-a-password).

`guest()` returns the same members with no session, except `login`. `guest({ locale: "zh" })` takes the `locale` option of `actingAs`. A `publicProcedure` sees `ctx.user` as `null`, and an `authedProcedure` rejects with `UNAUTHORIZED`.

Results keep their types, dates included. A rejection keeps the error's `code`, `actionCode` and `fields` for the [matchers](#expecting-failures). When the `.input()` schema of the procedure refuses the input, the rejection has `fields` too, so `toHaveValidationErrors` matches it. A `ConflictError` or an action failure with a `field` has `fields` too, with the message under that field. A path that is not a procedure of the router, such as a typo that the types did not catch, throws `No tRPC procedure at "booking.create"` and does not answer `NOT_FOUND`.

The callers reach the app over a control channel at `/_nuxvel/test/*`. Only a build for tests has it. See [Fakes](#fakes).

Each call is an HTTP request to the file's server on `localhost`. The procedure runs in the built server, with the same plugins, runtime config and generated modules as in production. The Vitest process does not have these, so the callers do not run procedures in the Vitest process.

## Factories

```bash
nuxvel make:factory post
```

`nuxvel make:factory post` writes a factory for the table in `server/database/schema/post.schema.ts`, and a test next to it. The factory has a [Faker](https://fakerjs.dev) value for each required column. A foreign key column gets a row from the factory of its target table:

```ts
// server/factories/post.factory.ts
import { faker } from "@faker-js/faker";
import { userFactory } from "./users.factory";
import { defineFactory } from "@nuxvel/nuxt/factories";
import { postTable } from "#nuxvel/schema";

export const postFactory = defineFactory(postTable, {
  title: () => faker.lorem.sentence(),
  body: () => faker.lorem.words(),
  authorId: async () => (await userFactory()).id,
});
```

The command selects a value from the type and the name of the column only. Change the values so that the rows look like real data. For example, give a post body some paragraphs of text:

```ts
body: () => faker.lorem.paragraphs(3),
```

```ts
const post = await postFactory();
const draft = await postFactory({ title: "Draft" });
```

`defineFactory(table, definition)` returns a factory. Call the factory to insert a row. It returns the row as the table's select type, with `id` and database defaults included. An argument overrides columns for that call.

A value in `definition` is a literal or a function. A function runs once per row and can be async.

Import `defineFactory` and `sequence` from `@nuxvel/nuxt/factories`. In a test, a factory runs in the test process, on its own connection to the test database. It needs no server. A [seeder](./database.md#seeding) can use the same factories. There, a factory inserts through `useDb()`, so its rows are part of the transaction of the seeder. In [`nuxvel tinker`](./cli.md#nuxvel-tinker), each factory under `server/factories/` and `server/domains/<domain>/factories/` is in scope and inserts through `useDb()`.

A `NOT NULL` column that is not in `definition` and has no database default also gets a Faker value when the factory inserts the row. The column type and the column name select the value. `nuxvel make:factory` and `nuxvel factory:sync` write the same values into the file:

| Column | Value |
|---|---|
| text with an enum | the first enum value |
| text, name contains `email` | `faker.internet.email()` |
| text, name contains `url`, `image` or `avatar` | `faker.internet.url()` |
| text, name contains `slug` | `faker.lorem.slug()` |
| text, name contains `title` | `faker.lorem.sentence()` |
| text, name contains `name` | `faker.person.fullName()` |
| other text | `faker.lorem.words()` |
| number | `faker.number.int({ min: 1, max: 1000 })` |
| boolean | `faker.datatype.boolean()` |
| date | `faker.date.recent()` |
| date in string mode (`date()`) | `faker.date.recent()` as `YYYY-MM-DD` |
| json, jsonb | `{}` |
| uuid | `crypto.randomUUID()` |
| inet | `faker.internet.ipv4()` |
| cidr | `faker.internet.ipv4()` with `/32` |
| macaddr, macaddr8 | `faker.internet.mac()` |
| numeric | `faker.finance.amount({ max: 9 })` |

A unique text column (`.unique()` or the primary key) gets a random UUID. A unique email column gets a Faker email with a random UUID before the `@`, for example `Jane.Doe+<uuid>@gmail.com`. The values are random in each run. When a test needs a fixed value, give the column in `definition` or in the call. For a unique value with domain meaning, use [`sequence()`](#sequences).

A column typed with `$type<SanitizedHtml>()` gets `() => sanitizeHtml(faker.lorem.paragraph())`, and the file imports `sanitizeHtml` from `@nuxvel/nuxt/factories`. A plain string would fail the typecheck, because a `SanitizedHtml` is a branded type. `nuxvel make:factory` and `nuxvel factory:sync` read the schema file to find these columns. The factory file runs outside Nuxt, so it imports `sanitizeHtml` and does not use the auto-import.

For any other column type, for example an array, `interval` or `time`, the factory throws and names the column. Give that column a value in `definition`. Add a column to `definition` only when the value cannot come from its type, for example a foreign key or a value with domain meaning.

### Fields that read other fields

```ts
export const requesterFactory = defineFactory(requesterTable, {
  name: () => faker.person.fullName(),
  email: (requester) => `${requester.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
});

const ada = await requesterFactory({ name: "Ada Lovelace" });
```

A function with a parameter gets the row that the factory builds. Such a function runs after all other columns have a value: the arguments of the call, `.state()` values, the other values of `definition` and the Faker values. Here, `ada.email` is `ada.lovelace@example.com`. When the call gives `email`, the function does not run.

Two functions with a parameter run in the order of `definition`. Thus a function can read a column that a function above it derives, but not one below it. A function without a parameter runs before the functions with a parameter.

### Sequences

```ts
// server/factories/users.factory.ts
import { randomUUID } from "node:crypto";
import { faker } from "@faker-js/faker";
import { defineFactory, sequence } from "@nuxvel/nuxt/factories";
import { userTable } from "#nuxvel/schema";

export const userFactory = defineFactory(userTable, {
  id: () => randomUUID(),
  name: () => faker.person.fullName(),
  email: sequence((n, user) => `${user.name.toLowerCase().replace(/[^a-z]+/g, ".")}${n}@example.com`),
});
```

`sequence(fn)` calls `fn` with a new number for each row. Use it for a unique column whose value means something. When `fn` has a second parameter, it gets the row, as a [field that reads other fields](#fields-that-read-other-fields) does. Here, the email of the user `Ada Lovelace` is `ada.lovelace5111@example.com`.

The number is a Postgres transaction id. It grows with each row, but it skips values. No other row, test file, worker, test run or seeder run gets the same number from the same Postgres server. Thus a value from `sequence()` stays unique also in a database that keeps its rows, for example a development database after a second `nuxvel db:seed`.

### States

```ts
const draftFactory = postFactory.state({ title: "Draft", body: "" });

const draft = await draftFactory();
const named = await draftFactory({ title: "Named draft" });
```

`factory.state(overrides)` returns a new factory. It merges `overrides` over the base `definition`. An argument to the call still wins over both.

```ts
const trashed = await postFactory.trashed()();
```

`factory.trashed()` returns a factory whose rows are soft-deleted. It sets `deletedAt` to the time of the insert. It exists only on a factory for a table with [`softDeletes()`](./soft-deletes.md). On another factory, a call fails `nuxt typecheck`.

### Relations

```ts
const author = await userFactory();
const post = await postFactory.for("authorId", author)();

post.authorId === author.id; // true
```

`factory.for(column, row)` returns a new factory that sets `column` to `row.id`. The type of `row.id` must fit the column. The column can be nullable, for example an optional assignee.

```ts
const author = await userFactory
  .has(3, (user) => postFactory.for("authorId", user))
  .has(1, (user) => postFactory.for("authorId", user).state({ title: "Pinned" }))();
```

`factory.has(count, (parent) => childFactory)` returns a new factory. After it inserts each row, it inserts `count` rows from the child factory that you build for that row. You can chain `.has()`.

```ts
const author = await userFactory();
const post = await postFactory.recycle(userTable, author)();
```

`factory.recycle(table, row)` returns a new factory. When a definition function, a `.has()` child or a hook calls a factory for `table` while this factory inserts, that call returns `row` and inserts nothing. Use it when a row has more than one path to the same parent, for example a comment and its post that both need one author. Only a call with no overrides reuses `row`. `.count()` still inserts.

### Hooks

```ts
const tagged = postFactory.afterCreate(async (post) => {
  await tagFactory({ postId: post.id });
});

const post = await tagged();
```

`factory.afterCreate(fn)` returns a new factory. It calls `fn` once for each row it inserts, after the insert, with the inserted row. Hooks and `.has()` children run in the order that you add them. You can chain `.afterCreate()`.

### Many rows

```ts
const author = await userFactory();
const posts = await postFactory.for("authorId", author).count(10)();
```

`factory.count(n)` returns a function that inserts `n` rows in one `INSERT ... RETURNING` statement and returns them. An argument overrides columns for every row. Each row still gets its own values from `definition`, and its own hooks and children. A function in `definition` that inserts a parent row still runs once per row. Use `.for()` to give all the rows one parent.

### Building without inserting

```ts
const author = await userFactory();
const { trpc } = actingAs(author);
const values = await postFactory.make({ authorId: author.id });

await trpc.post.create(values);
```

`factory.make(overrides)` returns the insert object of one row and does not insert it. The object has the type of the table's insert model. It holds the values from `definition` and the defaults for required columns, but not the database defaults. A function in `definition` still runs. If that function inserts a parent row, give the column in `overrides` to prevent the insert.

### Users with a password

```ts
const author = await userFactory.withPassword("secret-password")();

const { trpc, fetch } = await signIn(author.email, "secret-password");
```

`signIn(email, password)` signs the user in through the real `/api/auth/sign-in/email` endpoint. It returns the same members as `actingAs`, on that session. It throws when the app refuses the password, and when the user has two-factor sign-in on. `userFactory.withPassword(password)` returns a user factory that also writes the credential account of each user. The user can then sign in with `password`, with `signIn` or through the sign-in form in an end-to-end test. The factory computes the hash one time for each password. To sign a user in without a password, use [`actingAs(user)`](#acting-as-a-user).

`signIn(email, password, { headers })` sends `headers` with the sign-in and with each later `trpc`, `fetch` and `$fetch` call, for example `user-agent` to name the device of the session or `x-forwarded-for` to sign in from an IP. A header that a call gives itself wins.

```ts
const user = await userFactory.withTwoFactor("secret-password")();

await field(page, "Authentication code").fill(totpCode(twoFactorSecret));
```

`userFactory.withTwoFactor(password)` writes a user with two-factor sign-in on: the credential account of `password` and the `two_factor` row. The row holds `twoFactorSecret` and `twoFactorBackupCodes`, which the starter's factory file exports, encrypted with `NUXT_AUTH_SECRET` by `encryptAuthSecret()` of `@nuxvel/nuxt/factories`. `totpCode(twoFactorSecret)` returns the current code. The sign-in of such a user asks for the code, so `signIn` throws for it. Use `actingAs(user)` for a session that passed the second factor.

Do not sign a user up over HTTP to get a session in a helper or a hook. `npm run test:arch` flags the path `/api/auth/sign-up/email` or `/api/auth/sign-in/email` outside the body of a test, with the rule `nuxvel/test-auth`. A test of the sign-up or the sign-in itself sends the request in its own body.

`withPassword` is not part of `defineFactory`. The starter's `server/factories/users.factory.ts` adds it to `userFactory` with `.afterCreate()`:

```ts
// server/factories/users.factory.ts
const accountFactory = defineFactory(accountTable, { id: () => randomUUID(), providerId: "credential" });

function withPassword(password: string) {
  return baseUserFactory.afterCreate(async (row) => {
    await accountFactory({ accountId: row.id, userId: row.id, password: await passwordHash(password) });
  });
}

export const userFactory = Object.assign(baseUserFactory, { withPassword });
```

### Generating a factory

```bash
nuxvel make:factory post
nuxvel factory:sync
```

`nuxvel make:factory post` creates `server/factories/post.factory.ts`, which exports `postFactory`, for the table in `server/database/schema/post.schema.ts` or `post.ts`. Its `definition` holds a Faker value for each required column, the same values as in the table above. It also creates `server/factories/post.factory.test.ts`, which checks that the factory inserts a new row on every call. The schema file must exist.

When a migration makes a column required, `nuxvel factory:sync` adds a value for it to every factory under `server/factories/` and `server/domains/<domain>/factories/`. It adds only `NOT NULL` columns with no database default that the factory does not set yet. The values are the ones in the table above. A foreign key column gets a row from the factory of its target table, for example `authorId: async () => (await userFactory()).id`. Pass a name, such as `nuxvel factory:sync post`, to sync one file: `post.factory.ts`, or `post.ts` when the suffixed file does not exist.

### Scenarios

```ts
// tests/scenarios/blog.ts
import { postFactory, userFactory } from "#nuxvel/factories";

export async function blog({ posts = 1 }: { posts?: number } = {}) {
  const author = await userFactory();

  return { author, posts: await postFactory.for("authorId", author).count(posts)() };
}
```

```ts
import { blog } from "../scenarios/blog";

const { author, posts } = await blog({ posts: 3 });
const { trpc } = actingAs(author);
```

A scenario is an async function that builds a group of rows with factories and returns them. Put scenarios in `tests/scenarios/`, one file per scenario, and import them in functional and end-to-end tests. The rows keep the types of their factories.

## Running app code

```ts
const post = await runAction("posts.create-post", { title: "Hello", body: "" }, { actingAs: author });

await runJob("post.notify-followers", { postId: post.id });

await emit("post.published", { postId: post.id });

await runListener("post.notify-subscribers", { postId: post.id });

await workQueue();

await deliverWebhook("billing", { id: "evt_1", type: "invoice.paid" });

const { subject, html, text } = await renderMail("welcome", { to: "ada@example.com", name: "Ada" });

await sendNotification(author, "post.published", { postId: post.id, title: post.title });

await runBackfill("posts-content");

await runSeeder("database");

await runSchedule("posts.prune-drafts");
```

These fixtures run code inside the app that `@nuxvel/nuxt/testing/setup` started for the file. Each one takes a name from its folder, and the name is typed. A misspelled name or a wrong input fails to compile.

| Fixture | Runs | Names from |
|---|---|---|
| `runAction(name, input, { actingAs })` | an action as that user, and returns its result. `{ asSystem: name }` runs it as `systemActor(name)` | `server/actions/` |
| `runJob(name, input)` | a job's handler now, without the queue | `server/jobs/` |
| `emit(name, payload)` | the server `emit()` in a transaction, as an action would | `server/events/` |
| `runListener(name, payload)` | a listener's handler now, without the queue | `server/listeners/` |
| `workQueue()` | every queued job and queued listener, until the queue is empty | |
| `deliverWebhook(name, body)` | a signed delivery to a webhook endpoint, and returns the response | `server/webhooks/` |
| `renderMail(name, input)` | a mail's template, and returns its subject, HTML and text without sending it | `server/mail/` |
| `sendNotification(users, name, data)` | `notify()` in a transaction, as an action would | `server/notifications/` |
| `runBackfill(name)` | a backfill to completion | `server/database/backfills/` |
| `runSeeder(name)` | a seeder, and the seeders that it calls | `server/seeders/` |
| `runSchedule(name)` | one tick of a schedule now, without the worker and the clock | `server/schedules/` |

### Working the queue

```ts
await runAction("posts.publish-post", { id: post.id }, { actingAs: author });
await workQueue();

await expectMailSent("post.published", { to: follower.email });
```

`workQueue` runs every job and queued listener that waits in the queue fake. Use it to test a chain in one test, for example an action that queues a job that emits an event. A job that a run dispatches also runs. Each job runs with the dispatcher that queued it. The `nuxvel.mail` job does not run, so no mail leaves the test. Assert it with `expectMailSent`. A job that throws rejects `workQueue`. Delays are ignored.

### Actions

`runAction` calls an action without a procedure. Use it for an action that no procedure exposes yet, or to test an action apart from its router. To go through the procedure, use [`actingAs`](#acting-as-a-user).

The action validates its input, opens its transaction and writes its trace as it does when a procedure calls it. Pass the input before the schema parses it. A `fail()` rejects for `toBeActionError`. Invalid input rejects for `toHaveValidationErrors`. `runAction` also takes an action definition or its stub from `$actions` in place of the name. Then `input` and the result have the types of that action.

A router or a job can call an action as `systemActor(name)`, for example for a form that visitors use without an account. A schedule runs as `systemActor(<schedule name>)`, so an action that it calls gets that actor. To run such an action in a test, pass `{ asSystem: name }` in place of `actingAs`:

```ts
const ticket = await runAction("tickets.open-ticket", input, { asSystem: "support-form" });
```

The action gets the same actor as in the app, so a policy rule in `allowSystem()` sees the same name.

### Jobs

```ts
await runJob("post.notify-followers", { postId: post.id });

await expectRow(notificationsTable, { postId: post.id });
```

`runJob` also takes a job definition in place of the name. Then `input` has the input type of that definition's schema.

A test file gets each definition as a name stub from `#nuxvel/test-namespaces`. The `imports` field in the starter's `package.json` maps this specifier to `.nuxt/nuxvel/test-namespaces.mjs`. Node, Vitest and TypeScript read this field. The editor reads the types from the `.d.mts` file next to the `.mjs` file. This needs `moduleResolution` `Bundler`, `Node16` or `NodeNext`. The file exports `$jobs`, `$mails`, `$events`, `$notifications`, `$actions`, `$listeners`, `$channels`, `$flags`, `$experiments`, `$backfills`, `$seeders` and `$rateLimits`. At runtime, each key holds only the name. Its type is the server definition, so go-to-definition opens the server file. `nuxt prepare` and `nuxt dev` write the file.

```ts
import { $jobs } from "#nuxvel/test-namespaces";

await runJob($jobs.post.notifyFollowers, { postId: post.id });
```

`runJob` tests what a job does, not that it was queued. It needs no worker and no queue. The effect is in the database when the call resolves.

The job's schema validates `input` as it does for a dispatched payload. Invalid input rejects with a `BAD_REQUEST` validation error. A handler that throws rejects with its error.

### Listeners

```ts
await runListener("post.notify-subscribers", { postId: post.id });

await expectRow(notificationsTable, { postId: post.id });
```

`runListener` runs a listener's handler in the app and waits for it. `emit` and `runListener` also take a definition or its stub from `$events` or `$listeners` in place of the name. Use it for a queued listener. `emit` only puts a queued listener on the queue fake, and no worker runs it in a test.

The listener name is typed, but `payload` is not typed. The event's schema parses `payload` as it does for a queued run. An invalid payload rejects with a `BAD_REQUEST` validation error. A handler that throws rejects with its error.

A `dispatchAfterCommit()` in the handler runs with no transaction, as under `nuxvel queue:work`. Assert the follow-up job with `expectQueued`.

### Events, mail, notifications, backfills and seeders

`emit` runs sync listeners before it resolves. Queued listeners go to the queue fake after the transaction commits. The event's schema parses the payload. An invalid payload rejects with a `BAD_REQUEST` validation error.

`renderMail` parses `input` with the mail's schema and sends nothing. Invalid input rejects with a `BAD_REQUEST` validation error. To assert that code sends a mail, use `expectMailSent`.

`renderMail` also takes a mail definition or its stub from `$mails` in place of the name. Then `input` has the input type of that definition's schema.

`sendNotification` writes the `database` rows and records the send before it resolves. The `nuxvel.notification` job goes to the queue fake. The notification's schema parses `data`. Invalid data rejects with a `BAD_REQUEST` validation error. Assert with `expectNotified`. `sendNotification` also takes a notification definition or its stub from `$notifications` in place of the name. Then `data` has the input type of that definition's schema.

`runBackfill` rejects with the handler's error when a batch throws. That batch rolls back first. `runBackfill` also takes a backfill definition or its stub from `$backfills` in place of the name.

`runSeeder` rejects with the seeder's error when the seeder throws. The transaction of the seeder rolls back first. `runSeeder` also takes a seeder definition or its stub from `$seeders` in place of the name.

## Asserting on the database

```ts
const row = await expectRow(postTable, { id: post.id, title: "Hello" });
```

`expectRow(table, match)` checks that a row of `table` matches every column in `match`, and returns it. `match` is typed by the table, so an unknown column fails to compile. `null` matches `IS NULL`. When no row matches, the error shows the three rows that match the most columns of `match`.

`expectRow` reads on its own connection, outside any transaction the app has open. It sees committed rows only.

```ts
await trpc.post.delete({ id: post.id });
await expectNoRow(postTable, { id: post.id, deletedAt: null });
await expectSoftDeleted(postTable, { id: post.id });

await expectCount(commentTable, 3, { postId: post.id });
await expectCount(postTable, 0);
```

`expectSoftDeleted(table, match)` checks that a soft-deleted row of `table` matches, and returns it. It takes only a table with `softDeletes()`. `expectNoRow(table, match)` checks that no row of `table` matches `match`. `expectCount(table, n, match?)` checks that exactly `n` rows match. Without `match`, it counts every row of the table. Both use the matching rules and the connection of `expectRow`.

```ts
await trpc.post.update({ id: post.id, title: "Updated", body: "Text" });

const entry = await expectAudited("post.updated", { targetId: String(post.id) });
expect(entry.changes).toEqual({ title: { from: "Draft", to: "Updated" } });
```

`expectAudited(action, match?)` checks that an `audit_log` row exists for `action` with the columns in `match`, and returns it. It reads the `audit_log` table from the app's schema. `expectNotAudited(action, match?)` checks that no such row exists. See [Audit log](./audit.md).

## Asserting on presence

```ts
const member = await expectPresent("posts", { id: post.id }, user);
expect(member.state).toEqual({ typing: true });
```

`expectPresent(channel, params, user)` checks that the user is a member of one room of a presence channel, and returns the member. It also takes the channel definition or its stub from `$channels`. It reads what `presenceOf()` returns in the app. `expectNotPresent(channel, params, user)` checks that the user is not a member. A connection must join the room first, for example a browser page with `usePresence()`. See [Realtime: presence](./realtime.md#presence).

## Expecting failures

```ts
await expect(
  runAction("posts.create-post", { title: "", body: "" }, { actingAs: author }),
).rejects.toHaveValidationErrors("title");

await expect(guest().trpc.post.create({ title: "Hello", body: "" })).rejects.toBeTrpcError("UNAUTHORIZED");

await expect(
  runAction("posts.update-post", { id: post.id, title: "Hello", body: " " }, { actingAs: author }),
).rejects.toBeActionError("post.body-empty");

await expect(
  trpc.post.update({ id: post.id, title: "Hello", body: " " }),
).rejects.toBeTrpcError("UNPROCESSABLE_CONTENT");
```

`@nuxvel/nuxt/testing/setup` registers five matchers:

| Matcher | Passes for |
|---|---|
| `toHaveValidationErrors(...fields)`, `toHaveValidationErrors({ field: message })` | a validation error with messages on each field named, or with a message that matches for each field in the object |
| `toBeActionError(actionCode)` | an action's `fail()` with that declared code |
| `toBeTrpcError(code)` | a tRPC error with that code, such as `"NOT_FOUND"` or `"FORBIDDEN"` |
| `toBeUnrecoverable()` | a `runJob` rejection that the worker fails at once, without a retry |
| `toBeRetryable()` | a `runJob` rejection that the worker retries with the job's backoff |

`toHaveValidationErrors` accepts a `ValidationFailedError`, or any error with a `fields` map and the code `VALIDATION_ERROR`, `BAD_REQUEST`, `CONFLICT` or `UNPROCESSABLE_CONTENT`. It fails when the error has no fields at all. It ignores fields that you do not name. The error of a REST 400 that `actingAs(user).$fetch()` rejects with works too.

To check the messages, pass one object. Each value is a string, a `RegExp` or an asymmetric matcher. A field passes when one of its messages matches. A failed check prints the expected and the received message of each field.

```ts
await expect(
  runAction("posts.create-post", { title: "", body: "" }, { actingAs: author }),
).rejects.toHaveValidationErrors({ title: /required|too small/i, body: expect.any(String) });
```

`toBeActionError` accepts only an `ActionError`. A tRPC error with the same `code` fails it.

`toBeUnrecoverable` and `toBeRetryable` follow the rules in [Failures and retries](./queues.md#failures-and-retries). They accept only a rejection of `runJob`.

```ts
await expect(runJob("post.notify-followers", { postId: 0 })).rejects.toBeUnrecoverable();
```

`toBeTrpcError` checks the code at compile time. Through tRPC, an action's `fail()` has the code `UNPROCESSABLE_CONTENT`. Match its declared code with `toBeActionError`.

### Refusing a whole router

`expectRefused(router, code)` checks that every procedure of a router refuses the caller with `code`:

```ts
await expectRefused(actingAs(await userFactory()).trpc.tickets.ticket, "FORBIDDEN");
await expectRefused(guest().trpc.tickets, "UNAUTHORIZED");
```

It reads the procedures from the app router, so the check includes a procedure that you add later. It calls each procedure with no input. The role check must run before `.input()`, which is the case for a procedure built on `authedProcedure`, `roleProcedure()` or `adminProcedure`. The failure message names each procedure that answered or refused with a different code. You can also pass one procedure, such as `trpc.account.signUps`.

## Many cases in one test

When tests differ only by their data, write the test once and give it a list of cases. Use `it.for`, not `it.each`. `it.for` passes the case as one argument and does not spread it. It also keeps the test context as the second argument, so fixtures from `test.extend` still work.

Before, two tests repeat the same set-up:

```ts
it("rejects a blank title with a readable message", async () => {
  const ada = await userFactory();
  const board = await projectFactory({ ownerId: ada.id });

  await expect(actingAs(ada).trpc.task.create({ title: "   ", projectId: board.id })).rejects.toMatchObject({
    fields: { title: ["Describe the task"] },
  });
});

it("rejects a due date that is not YYYY-MM-DD", async () => {
  const ada = await userFactory();
  const board = await projectFactory({ ownerId: ada.id });

  await expect(
    actingAs(ada).trpc.task.create({ title: "Book the venue", projectId: board.id, due: "31/01/2026" }),
  ).rejects.toHaveValidationErrors("due");
});
```

After, one test runs once for each case. A new bad input is one more line:

```ts
it.for<{ name: string; input: { title?: string; due?: string }; errors: Record<string, string | RegExp> }>([
  { name: "a blank title", input: { title: "   " }, errors: { title: "Describe the task" } },
  { name: "a due date that is not YYYY-MM-DD", input: { due: "31/01/2026" }, errors: { due: expect.any(String) } },
])("rejects $name", async ({ input, errors }) => {
  const ada = await userFactory();
  const board = await projectFactory({ ownerId: ada.id });

  await expect(
    actingAs(ada).trpc.task.create({ title: "Book the venue", projectId: board.id, ...input }),
  ).rejects.toHaveValidationErrors(errors);
});
```

The type argument gives every case the same type. Without it, TypeScript infers a union of the cases, and `errors` does not match the type of `toHaveValidationErrors`.

`$name` in the title reads the key `name` of the case, so the report shows `rejects a blank title`. `$a.b` reads a nested key. For a case that is an array, `%s` reads its first item. `%#` is the index of the case. The title cannot print a function, so give each case a `name` string.

`npm run test:arch` flags `it.each`, `test.each` and `describe.each`, and `it`, `test` or `describe` called in a `for` loop or a `forEach`, `map` or `flatMap` callback, with the rule `nuxvel/test-each`. `describe.for` runs a group of tests once for each case.

Each case reports on its own, and one failure does not hide the others. A `for` loop inside one test stops at the first failure.

### Values in the case list are data or functions, never rows

nuxvel empties the tables after each test. Vitest builds the case list once, when it collects the tests. A row that a factory makes in the list is gone when the second case runs. Put the factory in a function, and call the function inside the case:

```ts
it.for([
  { name: "trash", ticket: () => ticketFactory(), call: (trpc: TestCaller, ticket: TicketRow) => trpc.tickets.ticket.trash({ id: ticket.id }) },
  { name: "restore", ticket: () => ticketFactory({ deletedAt: new Date() }), call: (trpc: TestCaller, ticket: TicketRow) => trpc.tickets.ticket.restore({ id: ticket.id }) },
])("keeps the trash to admins: $name", async ({ ticket: makeTicket, call }) => {
  const ticket = await makeTicket();

  await expect(call(actingAs(await userFactory({ role: "agent" })).trpc, ticket)).rejects.toBeTrpcError("FORBIDDEN");
});
```

`TestCaller` is the type of `actingAs(user).trpc`. It types the parameter of a call function, so a case list keeps its types.

### A matrix

`describe.for` around `it.for` runs each test of the inner list for each case of the outer list:

```ts
describe.for(["user", "guest"] as const)("a %s", (who) => {
  it.for([
    { name: "trash", call: (trpc: TestCaller) => trpc.tickets.ticket.trash({ id: 1 }) },
    { name: "restore", call: (trpc: TestCaller) => trpc.tickets.ticket.restore({ id: 1 }) },
  ])("cannot $name a ticket", async ({ call }) => {
    const trpc = who === "user" ? actingAs(await userFactory()).trpc : guest().trpc;

    await expect(call(trpc)).rejects.toThrow();
  });
});
```

The `describe.for` function runs when Vitest collects the tests, as the case list does. Make rows inside the `it.for` test, not in the `describe.for` function.

## Scenarios without a helper

Some checks need no fixture. Use `expect` and the fixtures that you know.

### Pagination

```ts
const author = await userFactory();
await postFactory.for("authorId", author).count(25)();

const second = await trpc.post.list({ page: 2, perPage: 10 });

expect(second).toMatchObject({ page: 2, perPage: 10, total: 25, lastPage: 3 });
expect(second.rows).toHaveLength(10);
```

`factory.count(n)` inserts the rows in one statement. Check the last page too, because it is not full. See [Database: pagination](./database.md#pagination).

### Idempotency

```ts
const ada = actingAs(await userFactory(), { headers: { "Idempotency-Key": "k1" } });
const input = { title: "Hello", body: "First post" };

const first = await ada.trpc.post.create(input);
const repeat = await ada.trpc.post.create(input);

expect(repeat.id).toBe(first.id);
await expectCount(postTable, 1);
```

A repeat with the same key and input returns the first result and runs nothing. To check a repeat while the first call still runs, send both calls together with `Promise.allSettled`. One call rejects:

```ts
const results = await Promise.allSettled([ada.trpc.post.create(input), ada.trpc.post.create(input)]);
const refused = results.filter((result) => result.status === "rejected");

expect(refused).toHaveLength(1);
await expect(Promise.reject(refused[0]?.reason)).rejects.toBeTrpcError("CONFLICT");
```

See [API: idempotent mutations](./api.md#idempotent-mutations).

### A snapshot of a response

```ts
const post = await trpc.post.byId({ id: created.id });

expect(post).toMatchSnapshot({ id: expect.any(Number), createdAt: expect.any(Date) });
```

The property matchers keep the snapshot stable. The snapshot stores the matcher in place of the value, so only the other fields must match. Use `freezeTime()` instead when you want the real date in the snapshot, see [Controlling time](#controlling-time).

### The content of a mail

```ts
const sent = await expectMailSent("post.published", { to: subscriber.email });
const { subject, text } = await renderMail("post.published", sent);

expect(subject).toBe("New post: Hello");
expect(text).toContain("Read the post");
```

`expectMailSent` returns the input of the send, and `renderMail` accepts it as it is. Thus the test checks the content of the mail that the action really sent. See [Mail: testing](./mail.md#testing).

### A file input in a browser

```ts
const page = await actingAs(await userFactory()).visit("/posts/new");

await page.locator('input[type="file"]').setInputFiles("tests/fixtures/cover.png");
await button(page, "Create post").click();
await expect(toast(page, "Post created")).toBeVisible();
```

`page` is a Playwright `Page`, so `setInputFiles` is the Playwright method. It accepts a path, or an object with `name`, `mimeType` and `buffer`. A functional test has no file input: use `upload(name, file)` to put a file in storage, see [Fixture reference](#fixture-reference).

## Fakes

```ts
const post = await trpc.post.create({ title: "Hello", body: "" });

await expectQueued("post.notify-followers", { postId: post.id }, { times: 1 });
await expectNoMailSent("welcome");
```

A build for tests replaces the queue and the mail transport with fakes. The fakes record what the app dispatches, emits, queues and mails. Nothing reaches the real Redis queue or the SMTP server. A relay records the job and does not enqueue it. Delivery happens only in the `nuxvel.mail` job, and no functional test runs that job. `workQueue()` skips it.

The fakes are plain functions, not mocks. The module installs them only when Nuxt builds for tests, together with the `/_nuxvel/test/*` control channel. `nuxt build` and `nuxt dev` have neither. In a server that Vitest did not start, the channel answers 404.

The fakes record after the commit. A rolled-back transaction leaves nothing to assert on. This holds for emitted events too: `expectNotEmitted` passes after a rolled-back `emit()`, and a sync listener still runs inline. `@nuxvel/nuxt/testing/setup` clears the records after every test.

Each assertion takes a name that is typed from `server/jobs/`, `server/mail/`, `server/notifications/` or `server/events/`. Its `match` fields are typed by that definition's schema. A `match` checks that the recorded payload includes those fields.

| Assertion | Passes when |
|---|---|
| `expectQueued(name, match?, { times? })` | a job `name` with a matching payload reached the queue. Returns the latest matching payload |
| `expectNotQueued(name, match?)` | no job `name` with a matching payload reached the queue. Without `match`, any job `name` fails it |
| `expectEmitted(name, match?, { times? })` | `emit()` fired for the event `name` with a matching payload. Returns the latest matching payload |
| `expectNotEmitted(name, match?)` | `emit()` never fired for the event `name` with a matching payload |
| `expectListenerRan(name, { times? })` | the sync listener with that file name ran. Returns the latest run |
| `expectNoListenerRan(name)` | the sync listener with that file name never ran |
| `expectListenerQueued(name, { times? })` | the queued listener with that file name reached the queue. Returns the latest queued payload |
| `expectMailSent(name, match?, { times? })` | `sendMail` sent the mail `name` with matching input fields, `to` included. Returns the input of the latest matching send |
| `expectNoMailSent(name, match?)` | the mail `name` was never sent, or never with an input that includes `match` |
| `expectNotified(user, name, match?, { times? })` | `notify()` reached the user with the notification `name`, and its `toDatabase` message has the `match` fields. Returns the latest matching notification |
| `expectPushSent(user, match?, { times? })` | `sendPush` notified the user with a notification that has the `match` fields. Returns the notification |
| `expectPolicyChecked(action, table, { allowed?, times? })` | the app asked a policy about `action` on `table`. Returns the latest decision |
| `expectActionCalled(name, { actingAs?, asSystem?, times? })` | the app called the action as that actor. Returns the latest call |
| `expectNoPushSent(user, match?)` | `sendPush` never notified the user with a notification that has the `match` fields |
| `expectNotNotified(user, name)` | the notification `name` never reached the user |

`expectQueued`, `expectNotQueued` and `expectListenerQueued` relay the outbox first. A job that `dispatchAfterCommit()` wrote is visible without `nuxvel queue:work`.

The job assertions also take a job definition in place of the name. Then `match` has the input type of that definition's schema.

Every positive assertion above, and `expectFetched`, takes `{ times }`. Then exactly `times` records must match, and `times` must be 1 or more. Use `times: 1` to check that a handler ran once and not again. Every positive assertion returns the latest matching record. When no record matches, the error lists what the fake recorded. The name in `expectMailSent` is the mail's name, not the recipient. `expectMailSent` and `expectNoMailSent` also take a mail definition or its stub from `$mails`. `expectNotified` and `expectNotNotified` also take a notification definition or its stub from `$notifications`. `expectEmitted` and `expectNotEmitted` also take an event definition or its stub from `$events`. `expectListenerRan`, `expectNoListenerRan` and `expectListenerQueued` also take a listener definition or its stub from `$listeners`. A send to an address on the suppression list is never recorded. `expectMailSent` first waits for the mails that an auth endpoint sends after its response.

The queue fake applies `unique` as the real queue does. While a job with the key `<job name>:<key>` is in the fake, a second dispatch with the same key is dropped, and `expectQueued` sees one job. `workQueue()` and `runJob` free the key when they take the job. See [Queues](./queues.md#testing).

A queued listener does not run when it is emitted. `expectListenerRan` sees sync listeners only. Assert a queued listener with `expectListenerQueued`, or run it with `workQueue()`.

### Webhooks

```ts
const { type, data } = await expectWebhookSent("ticket.created", { data: { id: ticket.id } });
await expectNoWebhookSent("ticket.deleted");
```

`sendWebhook()` queues one `nuxvel.webhook` job for each endpoint after the transaction commits. `expectWebhookSent(type, match?, { times? })` reads these jobs. It returns the parsed `{ type, timestamp, data }` of the latest match, so a test does not name the job or parse its JSON body. `match.data` checks the top-level fields of `data`. `match.endpoint` is the ID of one endpoint. One event counts once, even when many endpoints get it, unless `match.endpoint` is set. `expectNoWebhookSent(type?)` fails when the test sent an event, or an event of that `type`. A rolled-back `sendWebhook()` sends nothing. See [Webhooks](./webhooks.md#testing).

### Policies and actions

```ts
await expect(actingAs(other).trpc.post.update({ id: post.id, title: "Mine", body: "" })).rejects.toBeTrpcError("FORBIDDEN");

await expectPolicyChecked("update", postsTable, { allowed: false });
await expectActionCalled("posts.update-post", { actingAs: other });
```

`expectPolicyChecked(action, table, { allowed?, times? })` checks that the app asked a policy about `action` on a row of `table`. It sees every answer of `can()`, `canMany()` and `authorize()`. With `allowed`, it counts only decisions with that answer. It fails when a procedure never asked the policy. It returns the latest decision.

`expectActionCalled(name, { actingAs?, asSystem?, times? })` checks that the app called the action, as that user or as that system actor. A failed call counts too. The returned record has `ok`. It takes the same name or definition as `runAction`. Use it to prove that a router hands off to its action as the right actor.

### Errors and logs

```ts
await expect(trpc.post.publish({ id: post.id })).rejects.toThrow();

await expectErrorReported("stripe timeout");
await expectLogged("warn", "charge retried");
```

`expectErrorReported(match?, { times? })` checks that the app handed an error to error tracking. It sees an unexpected procedure error, a 500 of a route and a failed job run in the app. It does not see a 4xx tRPC error. `expectNoErrorReported()` checks that no error was reported, and lists the errors when one was. `expectLogged(level, match, { times? })` checks that the app logged a line at `level`. It sees only the lines at or above `NUXT_LOG_LEVEL`. `match` is text that the message contains, or a pattern. Each assertion returns the latest matching record.

A call through `actingAs().trpc` or `guest().trpc` reports an unexpected error and logs it, as in production.

### Broadcasts and cache lookups

```ts
await expectBroadcast("posts", "updated", { id: post.id });
await expectCacheMiss(["post", "list", null]);
```

`expectBroadcast(channel, event, match?, { times?, params? })` checks that the app broadcast the event on the channel, with a payload that has the `match` fields. `expectNotBroadcast(channel, event?, { params? })` checks that it did not. `params` limits both to one room of the channel. `expectCacheHit(key, { times? })` and `expectCacheMiss(key, { times? })` check that the app read the cache key and found it, or found nothing. `key` is the exact key that `remember()` or `cacheGet()` got, a string or an array of parts. Each assertion returns the latest matching record. See [Realtime](./realtime.md#testing-broadcasts) and [Cache](./cache.md#testing).

### Faking outbound requests

```ts
import { expectFetched, fakeFetch, runJob } from "@nuxvel/nuxt/testing";

it("pings the search engine for a new post", async () => {
  await fakeFetch({
    "https://search.example.com/ping": { status: 200, body: { ok: true } },
    "https://hooks.slack.com/*": { status: 204 },
  });

  await runJob("post.ping-search-engine", { postId: post.id });

  await expectFetched("https://search.example.com/ping", { method: "POST", times: 1 });
});
```

`fakeFetch(responses)` fakes every `fetch()` and `$fetch()` with an absolute URL in the app under test, for the rest of the test. Each key is a full URL, or a URL prefix that ends in `*`. A response has an optional `status`, `body` and `headers`. The default status is `200`. A `body` that is not a string goes out as JSON.

A request that no key matches fails like a network failure, with the cause `fakeFetch: no fake response for <method> <url>`. A `$fetch()` call then throws a `TransientError`, as for a service that does not answer. Nothing reaches the network.

`expectFetched(url, { method?, times? })` checks that the app sent a request to `url`. `url` matches like a `fakeFetch` key. With `times`, it checks the exact number of requests. It returns the latest matching request. `expectNotFetched(url, { method? })` checks that the app sent no such request.

`@nuxvel/nuxt/testing/setup` turns the fake off and clears the requests after every test. Without `fakeFetch`, requests go to the network.

### Stripe

With [billing](./billing.md) on, a test build answers every Stripe request from an in-memory Stripe. A test never reaches Stripe and needs no Stripe account. Each product under `server/products/` has a price under its lookup key: 1000 in `usd`, renewing each month for a subscription. `fakeStripe()` changes a price, or leaves a lookup key with no active price:

```ts
import { expectFetched, fakeStripe } from "@nuxvel/nuxt/testing";

it("charges the yearly price", async () => {
  await fakeStripe({ prices: { pro_monthly: { amount: 19000, currency: "eur", interval: "year" } } });

  await actingAs(user).trpc.billing.upgrade();

  const request = await expectFetched("https://api.stripe.com/v1/checkout/sessions", { method: "POST" });
  expect(new URLSearchParams(request.body).get("mode")).toBe("subscription");
});
```

The billing helpers act on the in-memory Stripe as a payment would. Then each one sends the Stripe events of that change through the real `POST /api/webhooks/stripe` and runs the `nuxvel.billing.process-event` job for each one. The rows, audit entries and events are those of a real payment. Use them to give a user a product in a test about something else, too:

```ts
import { $products } from "#nuxvel/test-namespaces";
import { actingAs, completeCheckout, expect, expectNotSubscribed, failRenewal } from "@nuxvel/nuxt/testing";

it("locks the reports once the renewal fails", async () => {
  const user = await userFactory();
  await completeCheckout(user, $products.pro);

  await failRenewal(user, $products.pro);

  await expectNotSubscribed(user, $products.pro);
  await expect(actingAs(user).trpc.reports.export()).rejects.toBeTrpcError("FORBIDDEN");
});
```

| Helper | What Stripe does |
|---|---|
| `completeCheckout(user, product)` | runs `checkout()` and pays the session. Returns the IDs of the session, and of the subscription or the payment intent |
| `renewSubscription(user, product)` | renews the subscription for one more period |
| `failRenewal(user, product)` | fails the renewal: the subscription is `past_due` |
| `cancelSubscription(user, product, { now? })` | cancels at the end of the period, or at once with `now` |
| `expectSubscribed(user, product, { status? })` | asserts a subscription that gives access, or with the given status |
| `expectNotSubscribed(user, product?)` | asserts no subscription that gives access |
| `refundPayment(user, product, { amount? })` | refunds the latest payment for a one-time product, all of it by default |
| `disputePayment(user, product, { reason? })` | opens a dispute on the latest payment for a one-time product |
| `expectPaid(user, product, { status? })` | asserts a payment that keeps the product, or with the given status |
| `expectNotPaid(user, product)` | asserts that the user does not keep the product |

In an end-to-end test, `checkout()` and `billingPortal()` return the URLs of test pages of the app in place of Stripe's. The test Checkout page pays the session through the same webhook and job, then sends the browser to the success URL. `fakeStripe({ checkout })` sets what it does when the browser opens it:

| `checkout` | The test Checkout page |
|---|---|
| `"manual"`, the default | shows a **Pay** and a **Cancel** button |
| `"pay"` | pays at once and goes to the success URL |
| `"decline"` | goes to the cancel URL |

```ts
it("upgrades to Pro", async () => {
  const user = await userFactory();
  const page = await actingAs(user).visit({ name: "pricing" });

  await fakeStripe({ checkout: "pay" });
  await button(page, "Upgrade").click();

  await expect(text(page, "Welcome to Pro")).toBeVisible();
  await expectSubscribed(user, $products.pro);
});
```

The test portal page lists the user's subscriptions with a **Cancel subscription** button, which cancels at the end of the period, and a **Return** link. To start a test from a user who already pays, call `completeCheckout()` first: it skips the pages.

`expectFetched` sees each Stripe request, with its form-encoded body. The in-memory Stripe answers the calls that nuxvel's billing makes. A `fakeFetch` key answers any other Stripe call of the app, such as `https://api.stripe.com/v1/invoices*`. `@nuxvel/nuxt/testing/setup` clears the in-memory Stripe after every test.

### Using the real queue

```ts
describe("the outbox", () => {
  useRealQueue();
});
```

`useRealQueue()` turns off the queue fake for the whole file. Relays then add jobs to the real BullMQ queue, as in production. Use it for a test that reads the queue itself, for example `useQueue().getWaiting()` after `relayOutbox()`. `expectQueued` records nothing after you call it.

Call it in the `describe` body. It applies again before every test, so a restart of the test server does not bring the fake back.

## Controlling time

```ts
import { freezeTime, travelBy, travelTo } from "@nuxvel/nuxt/testing";

it("closes comments 30 days after the post", async () => {
  const post = await trpc.post.create({ title: "Hello", body: "" });

  await travelBy({ days: 31 });

  await expect(trpc.comment.create({ postId: post.id, body: "Late" })).rejects.toBeActionError("comment.closed");
});

it("stamps the post with the frozen time", async () => {
  const frozenAt = await freezeTime(new Date("2030-01-01T00:00:00Z"));

  const post = await trpc.post.create({ title: "Hello", body: "" });

  await expectRow(postTable, { id: post.id, createdAt: frozenAt });
});
```

These fixtures move the clock of the app under test and of the Vitest process:

| Fixture | Does |
|---|---|
| `travelTo(date)` | sets the app's time to `date` |
| `travelBy({ days, hours, minutes, seconds })` | moves the app's time forward |
| `freezeTime(date?)` | stops the app's time at `date`, or at the current time |

Each one returns the app's new time. A factory runs in the Vitest process, so its rows get the moved time in `timestamps()` columns, the same as the rows that the app writes. After `travelTo` and `travelBy`, the clock keeps ticking, unless `freezeTime` stopped it. `@nuxvel/nuxt/testing/setup` puts the real time back after every test.

The fixtures move the server's [`now()`](./database.md#the-current-time). Every helper that reads the time uses it: `timestamps()`, `softDelete()`, `purgeTrashed()`, rotated secrets, API key expiry, rate limits, backfills, the outbox, notification reads, maintenance mode and flag state. Use `now()` in your own server code for the same result. A `new Date()` in server code or in a test does not move. The timestamp columns of the starter tables (`user`, `notifications`, `api_keys`, `audit_log` and the others) take their Drizzle default from `now()`, so a factory row gets the moved time. Better Auth sets `createdAt` and `updatedAt` of the rows that it writes itself (sign-up, sessions, accounts), and `audit()` reads the time of Postgres, so these two do not move.

## Query counts

```ts
import { expectConstantQueries, guest } from "@nuxvel/nuxt/testing";

await expectConstantQueries(async (size) => {
  await userFactory.has(size, (user) => postFactory.for("authorId", user))();
  await guest().trpc.post.list();
});
```

`expectConstantQueries(fn, sizes?)` calls `fn(size)` once for each size. It checks that the app ran the same number of queries for each size. An N+1 query then fails the test.

It counts the queries the app runs for the `actingAs`, `guest` and `runJob` calls in `fn`, including the `actingAs` user lookup. It does not count factory inserts, so `fn` can create `size` rows first.

`sizes` defaults to `[1, 4]`. On success, it returns the query count. When the counts differ, it throws with the count for each size. It also lists the queries that the size with the most queries ran more often than the size with the fewest queries.

Each size runs on the same database. The rows and the backfill progress of the earlier sizes stay. A job that completes on the first size, such as `runBackfill`, has no work left at the next size, so make `fn` create the data it needs for each size.

```ts
import { expectQueryCount, guest } from "@nuxvel/nuxt/testing";

await expectQueryCount({ max: 2 }, () => guest().trpc.post.list());
```

`expectQueryCount({ max }, fn)` checks that the app ran at most `max` queries for the calls in `fn`. It counts the same queries as `expectConstantQueries`. On success, it returns the query count. Over the budget, it throws with the count, the budget and the list of queries. Use it to hold one call to a fixed number of queries.

```ts
import { captureQueries, guest } from "@nuxvel/nuxt/testing";

const sql = await captureQueries(() => guest().trpc.post.list());

expect(sql).toHaveLength(1);
```

`captureQueries(fn)` returns the SQL text of each query the app ran for the calls in `fn`, in order. It counts the same queries as `expectQueryCount`. Use it to see which queries a call runs.

## Component tests

A component test is a story with a `play` function. `nuxvel test:ui` runs each story of the app in a headless Chromium, through [`@storybook/addon-vitest`](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon). A story passes when it renders and its `play` function does not throw. The [MSW mocks](./storybook.md#mocking-the-server) of the story apply in the test run, so a component test needs no server and no database.

```ts
// app/components/PostCard.stories.ts
import type { Meta, StoryObj } from "@storybook-vue/nuxt";
import { expect, heading, page } from "@nuxvel/nuxt/storybook/test";
import PostCard from "./PostCard.vue";

const meta = { component: PostCard, args: { title: "Hello" } } satisfies Meta<typeof PostCard>;

export default meta;

export const ShowsTheTitle: StoryObj<typeof meta> = {
  play: async () => {
    await expect(heading(page, "Hello")).toBeVisible();
  },
};
```

```bash
npm run test:ui
nuxvel test:ui app/components/PostCard.stories.ts
```

`nuxvel test:ui` starts no dev services. It runs the `ui` project of the [Vitest configuration](#vitest-configuration), and it passes every extra argument to Vitest. A new app's `npm run test:ui` script installs the browser first with `playwright-core install chromium-headless-shell`. A new app's `npm test` script runs the functional tests, then the component tests.

A `play` function uses the helpers and the `expect` of `@nuxvel/nuxt/storybook/test`. They have the names, the arguments and the options of the [end-to-end helpers](#find-elements). Thus a check reads the same in the two layers. Only the import is different, and `page` is the document of the story, not the page of `visit()`. See [Storybook: play functions](./storybook.md#play-functions).

| End-to-end (`@nuxvel/nuxt/testing`) | Component (`@nuxvel/nuxt/storybook/test`) |
|---|---|
| `const page = await visit("/posts")` | `page` |
| `button(scope, name, { exact })` | `button(scope, name, { exact })` |
| `link`, `heading`, `field`, `text`, `cell`, `dialog(scope, name?)`, `menu(scope, name?)`, `menuitem`, `alert(scope)` | the same |
| `toast(scope, text).dismiss()` | the same |
| scope: `page` or a locator | scope: `page`, a locator or `canvasElement` |
| `locator.click()`, `fill(value)`, `clear()` | the same |
| `fillForm(scope, values)` | the same |
| `locator.pressSequentially(text, { delay })`, `press("Control+A")` | the same |
| `locator.check()`, `uncheck()`, `setChecked(checked)` | the same |
| `locator.hover()` | the same |
| `await page.mouse.move(0, 0)` | `locator.unhover()` |
| `visit(target, { clock: true })`, then `page.clock.runFor(ms)` | no fake timers: a real `delay`, and `expect` tries again. See [Typing, timers and hover](#typing-timers-and-hover) |
| `locator.focus()`, `blur()` | the same |
| `locator.waitFor({ state })`, `count()`, `all()`, `first()`, `last()`, `nth(i)` | the same |
| `locator.filter({ has, hasText })`, `and(other)`, `getByRole`, `getByLabel`, `getByText`, `locator(css)` | the same |
| `expect(locator).toBeVisible()`, `toBeHidden`, `toHaveText`, `toContainText`, `toHaveValue`, `toHaveCount`, `toBeChecked`, `toBeDisabled`, `toBeEnabled`, `toHaveAttribute`, with `.not` | the same |
| `trpcSpy(page, path)`: the real server answers | `trpcSpy(path, implementation?)` in `mockTrpc`: the spy answers |
| `expect(spy).toHaveBeenCalled()`, `toHaveBeenCalledTimes`, `toHaveBeenCalledWith`, `toHaveBeenLastCalledWith`, with `.not` | the same |
| `expect(value)`: the Vitest `expect` | `expect(value)`: the `expect` of `storybook/test` |
| layout assertions, `toHaveURL`, `expectAccessible` | not available |

A new app has two component tests. `app/components/UserMenu.stories.ts` checks the menu of the `app` layout signed in, while signing out and signed out. `app/error.stories.ts` checks the 404 page. A decorator of the story sets the request ID through `useState("error-request-id")`. In the app, the page reads the ID from the `x-request-id` header. Each story of `UserMenu` gives the session with `mockUser`:

```ts
// app/components/UserMenu.stories.ts
const ada = mockUser({ email: "ada@example.com" });

export const SignsOut: StoryObj<typeof meta> = {
  parameters: { msw: [ada] },
  play: async () => {
    await button(page, "ada@example.com").click();
    await menuitem(page, "Sign out").click();

    await expect(link(page, "Sign in")).toBeVisible();
    await expect(button(page, "ada@example.com")).toBeHidden();
  },
};
```

The stories of `nuxvelStories()` live in `node_modules`, and Vitest does not collect them. Thus `nuxvel test:ui` runs only the stories of the app. The test widget of the Storybook UI runs the same tests. See [Storybook](./storybook.md#component-tests).

## End-to-end tests

```ts
import { actingAs, expect, heading } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory } from "#nuxvel/factories";

describe("the new post page", () => {
  it("opens for a signed-in author", async () => {
    const page = await actingAs(await userFactory()).visit("/posts/new");

    await expect(heading(page, "New post")).toBeVisible();
  });
});
```

Put end-to-end tests in `tests/e2e/`. The first `visit()` in a file starts a Playwright browser for the file.

```bash
npm run test:e2e
nuxvel make:test posts/new --e2e
```

`nuxvel test:e2e` starts the services and runs the tests in `tests/e2e/`, on the same build and test database as `nuxvel test`. A new app's `npm run test:e2e` script first installs the browser with `playwright-core install chromium-headless-shell`, then runs `nuxvel test:e2e`. `nuxvel make:test <page> --e2e` writes a test that opens the page with `visit()` and checks that the page stays at its URL. See the [CLI reference](./cli.md#nuxvel-teste2e).

### Find elements

```ts
import { button, expect, fillForm, toast, visit } from "@nuxvel/nuxt/testing";

const page = await visit("/posts/new");
await fillForm(page, { Title: "Hello" });
await button(page, "Create post").click();
await expect(toast(page, "Post created")).toBeVisible();
```

Find an element by what the screen shows: the text of a button, the label of a field. Each helper takes the page, or a part of the page, and a name. It returns a Playwright locator.

| Helper | Finds | Same as |
|---|---|---|
| `button(scope, name)` | a button | `scope.getByRole("button", { name, exact: true })` |
| `link(scope, name)` | a link | `scope.getByRole("link", { name, exact: true })` |
| `heading(scope, name)` | a heading of each level | `scope.getByRole("heading", { name, exact: true })` |
| `field(scope, label)` | an input, a select or a text area with that label | `scope.getByLabel(label, { exact: true })` |
| `text(scope, content)` | an element with that text, but not an element with `aria-hidden="true"` | `scope.getByText(content, { exact: true }).and(scope.locator(':not([aria-hidden="true"])'))` |
| `cell(scope, name)` | a table cell | `scope.getByRole("cell", { name, exact: true })` |
| `dialog(scope, name?)` | a dialog, or the dialog with that title | `scope.getByRole("dialog", { name, exact: true })` |
| `menu(scope, name?)` | a menu, such as the dropdown of a user menu, or the menu with that name | `scope.getByRole("menu", { name, exact: true })` |
| `menuitem(scope, name)` | an item of a menu | `scope.getByRole("menuitem", { name, exact: true })` |
| `alert(scope)` | an alert, such as a form error | `scope.getByRole("alert")` |
| `toast(scope, text)` | a Nuxt UI toast with that text | `scope.locator('[data-slot="viewport"]').getByRole("listitem").filter(...)` |

`fillForm(scope, { Label: value })` fills each field by its label, in order. It also fills the Nuxt UI controls: `USelect`, `USelectMenu` and `URadioGroup` take the label of an option, `UCheckbox` and `USwitch` take a boolean, and `<UInput type="date">` and `UInputDate` take an ISO date such as `"2026-03-14"`. `fillForm` finds a `URadioGroup` by the `<label>` of its form field, because the group has no accessible name. After a select it waits until the list of options is gone. A value that does not fit the control fails with the label and the control kind. `toast(page, text).dismiss()` closes a toast and waits until the toast is gone.

```ts
await fillForm(page, { Title: "Hello", Plan: "Pro", "Accept terms": true, Starts: "2026-03-14" });
await toast(page, "Post created").dismiss();
```

A name matches when it is the element's whole name, with case. Extra white space does not matter. Thus `button(page, "Delete")` does not find a button "Delete article 1". To match a part of the name, without case, give `{ exact: false }` as the last argument:

```ts
await button(page, "delete article", { exact: false }).click();
await expect(text(page, "created", { exact: false })).toBeVisible();
```

Give a `RegExp` for a different match, for example `button(page, /^Delete article \d+$/)`. A `RegExp` ignores `exact`. The helpers find elements by their accessible role and name. Thus a test that passes also shows that a screen reader finds the element.

To find an element in a part of the page, give that part as the scope:

```ts
await button(dialog(page, "Delete post?"), "Delete").click();
```

For other roles, and for options such as `level`, use the Playwright methods on the page, such as `page.getByRole("row")`.

### expect

```ts
import { alert, button, dialog, expect, guest, visit } from "@nuxvel/nuxt/testing";

await expect(guest().trpc.post.create({ title: "Hi" })).rejects.toBeTrpcError("UNAUTHORIZED");
expect({ id: 7, title: "Hi" }).toEqual({ id: expect.any(Number), title: "Hi" });

const page = await visit("/posts");
await button(page, "Delete My post").click();
await button(dialog(page, "Delete post?"), "Delete").click();
await expect(page.getByRole("row")).toHaveCount(2);
await expect(alert(page)).toHaveText("Post deleted");
await expect(page).toHaveURL(/\/posts$/);
```

`expect` from `@nuxvel/nuxt/testing` is one `expect` for every kind of test. It looks at the value that you give it:

- A Playwright `Locator` or `Page` goes to the `expect` of Playwright. An assertion such as `toBeVisible`, `toHaveText`, `toHaveCount` or `toHaveURL` tries again until it passes. Thus a test does not need `waitFor()` before it checks the page. When the assertion does not pass in the [browser timeout](#browser-timeout), it fails with the expected value, the last value it received and the timeout. Give a different timeout to one assertion with `{ timeout }`. See the [Playwright assertions](https://playwright.dev/docs/test-assertions) for the full list.
- A spy from [`trpcSpy`](#trpc-calls) has `toHaveBeenCalled`, `toHaveBeenCalledTimes`, `toHaveBeenCalledWith` and `toHaveBeenLastCalledWith`. They try again until they pass or the browser timeout ends.
- Any other value goes to the `expect` of Vitest, with `.not`, `.resolves`, `.rejects` and the nuxvel matchers, such as `toBeTrpcError` and `toHaveValidationErrors`.

The members of `expect` are the Vitest members: `expect.any`, `expect.objectContaining` and the other asymmetric matchers, `expect.poll`, `expect.assertions` and `expect.soft`. `expect.soft` takes a value, not a locator. Outside the Playwright test runner, a failed Playwright soft assertion stops the test at once. Thus, for a locator, use `expect(locator)`.

The types follow the value. `expect(locator)` has the locator assertions, `expect(page)` has the page assertions and `expect(value)` has the Vitest matchers. Thus `expect(1).toBeVisible()` and `expect(locator).toBeTrpcError(...)` do not compile.

### tRPC calls

```ts
import { expect, field, trpcSpy, visit } from "@nuxvel/nuxt/testing";

const page = await visit("/posts");
const list = trpcSpy(page, "post.list");

await field(page, "Search").pressSequentially("hello", { delay: 50 });

await expect(list).toHaveBeenCalledWith({ q: "hello" });
await expect(list).toHaveBeenCalledTimes(1);
```

`trpcSpy(page, path)` returns a `vi.fn()` that records the calls of the page to the procedure at `path`. `page` is a page from `visit()` or `actingAs(user).visit()`. The spy reads each request of the browser to `/api/trpc`: a query, a mutation, batched or not. Each call gets the input of the procedure, as the procedure gets it.

The real server answers each call, and the spy does not change the answer. To give a fake answer, write a [component test](./storybook.md#mocking-the-server) with `mockTrpc` and the component `trpcSpy`. The two spies have the same name and the same assertions.

The spy records only the calls after `trpcSpy`. Thus it does not record the calls of the server rendering. `expect(spy)` has `toHaveBeenCalled`, `toHaveBeenCalledTimes`, `toHaveBeenCalledWith` and `toHaveBeenLastCalledWith`, and `.not`. Each assertion tries again until it passes or the [browser timeout](#browser-timeout) ends. Then it fails with the calls and the diff. Give a different timeout to `toHaveBeenCalled` or `toHaveBeenCalledTimes` with `{ timeout }`.

`path` and the arguments of `toHaveBeenCalledWith` are typed from the router. Thus `trpcSpy(page, "post.missing")` and `toHaveBeenCalledWith({ q: 1 })` do not compile.

### Typing, timers and hover

A debounced search, a field that validates while the user types and a tooltip all wait on timers. The end-to-end test and the component test check them with the same helpers. Only the timers are different.

In an end-to-end test, give `visit()` the `clock: true` option. `visit` then installs the [Playwright clock](https://playwright.dev/docs/clock) and pauses it before the page loads. A test cannot do this itself, because `visit` loads the page. After `visit`, a browser timer runs only when the test moves the clock with `page.clock.runFor(ms)`. Thus a debounce needs no real wait, and the test can check that nothing happens before the debounce ends. The tRPC client sends its requests in a 0 ms timer. The Playwright clock runs a 0 ms timer that another timer starts 1 ms later. Thus `runFor(300)` runs the debounce, but not the request that the debounce starts. For this reason, `expect(spy)` of a [`trpcSpy`](#trpc-calls) moves the paused clock 1 ms at each try while it waits for a call. Thus the test does not call `page.clock.resume()`. `actingAs(user).visit()` takes the same option. The option controls only the timers of the browser. `freezeTime()` and `travelTo()` still control the [clock of the server](#controlling-time).

A component test has no fake timers: `vi.useFakeTimers` does not run in the Storybook UI, and `storybook/test` has none. The `play` function types with a short real `delay`, and `expect` tries again until the call or the text arrives.

End-to-end, a search that waits 300 ms after the last key:

```ts
import { expect, field, text, trpcSpy, visit } from "@nuxvel/nuxt/testing";

const page = await visit("/posts", { clock: true });
const list = trpcSpy(page, "post.list");

await field(page, "Search").pressSequentially("hello");
await page.clock.runFor(299);
await expect(list).not.toHaveBeenCalled();

await page.clock.runFor(1);
await expect(list).toHaveBeenCalledWith({ q: "hello" });
await expect(list).toHaveBeenCalledTimes(1);
```

The same search in a component test. The first call is the query with an empty search, when the component mounts:

```ts
import { mockTrpc, trpcSpy } from "@nuxvel/nuxt/storybook/mocks";
import { expect, field, page, text } from "@nuxvel/nuxt/storybook/test";

const list = trpcSpy("post.list", (input) => ({ rows: [], page: 1, perPage: 15, total: input?.q ? 1 : 0, lastPage: 1 }));

export const Debounces = {
  parameters: { msw: [mockTrpc({ post: { list } })] },
  play: async () => {
    await field(page, "Search").pressSequentially("hello", { delay: 50 });
    await expect(list).toHaveBeenCalledWith({ q: "hello" });
    await expect(text(page, "1 posts")).toBeVisible();
    await expect(list).toHaveBeenCalledTimes(2);
  },
};
```

End-to-end, a `UForm` that validates on input and a `UButton` in a `UTooltip`. `UForm` waits 300 ms after a key before it validates (`validateOnInputDelay`), and the tooltip opens after a delay too:

```ts
const page = await visit("/posts/new", { clock: true });

await field(page, "Title").pressSequentially("ab");
await page.clock.runFor(300);
await expect(text(page, "Title needs at least 3 characters")).toBeVisible();
await field(page, "Title").pressSequentially("c");
await page.clock.runFor(300);
await expect(text(page, "Title needs at least 3 characters")).toHaveCount(0);

await button(page, "Save draft").hover();
await page.clock.runFor(1000);
await expect(text(page, "Saves the draft")).toBeVisible();
await page.mouse.move(0, 0);
await page.clock.runFor(1000);
await expect(text(page, "Saves the draft")).toHaveCount(0);
```

The same form in a component test:

```ts
export const ValidatesAndHovers = {
  play: async () => {
    await field(page, "Title").pressSequentially("ab", { delay: 50 });
    await expect(text(page, "Title needs at least 3 characters")).toBeVisible();
    await field(page, "Title").pressSequentially("c");
    await expect(text(page, "Title needs at least 3 characters")).toHaveCount(0);

    await button(page, "Save draft").hover();
    await expect(text(page, "Saves the draft")).toBeVisible();
    await button(page, "Save draft").unhover();
    await expect(text(page, "Saves the draft")).toHaveCount(0);
  },
};
```

A tooltip of Nuxt UI shows its text two times: one visible copy, and one copy with `aria-hidden="true"` and the visually hidden style, which the button names in `aria-describedby`. `getByText` of Playwright finds both copies. `text()` skips an element with `aria-hidden="true"` in both layers, so it finds only the visible copy. Playwright has no `unhover()`: an end-to-end test moves the mouse away with `page.mouse.move(0, 0)`.

A failing assertion waits for the [browser timeout](#browser-timeout), 5 seconds by default. Give the test a longer test timeout than that, or give the assertion a shorter `{ timeout }`. Otherwise the test timeout ends first and hides the diff.

### Layout assertions

```ts
import { button, expect, heading, visit } from "@nuxvel/nuxt/testing";

const page = await visit("/posts");
await expect(heading(page, "Posts")).toBeAbove(button(page, "New post"));
await expect(button(page, "Cancel")).toBeLeftOf(button(page, "Save"));
```

The `expect` also checks where an element is on the screen, compared with another element:

- `toBeAbove(other)`: the bottom of the element is at or above the top of `other`.
- `toBeBelow(other)`: the top of the element is at or below the bottom of `other`.
- `toBeLeftOf(other)`: the right side of the element is at or left of the left side of `other`.
- `toBeRightOf(other)`: the left side of the element is at or right of the right side of `other`.

Like the other assertions, they try again until they pass or the timeout ends. When one fails, the message shows the edges of the two elements. When one of the elements is not visible, the assertion fails, also with `.not`. Use them for a layout that must not change, for example the order of buttons on a phone. Open the page with a device, such as `visit("/posts", devices["iPhone 13"])`.

A new app has `playwright` as a dev dependency. In an older app, install it as a dev dependency.

### Browser timeout

Each `expect` assertion, and each action and navigation on a page from `visit`, fails after 5 seconds. Playwright's own default for actions is 30 seconds. To change the timeout for every end-to-end test, set `nuxvelBrowserTimeout` in milliseconds in the Vitest config:

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    provide: { nuxvelBrowserTimeout: 5000 },
  },
});
```

To change the timeout of one call, give it `{ timeout }`:

```ts
await button(page, "Import").click({ timeout: 20_000 });
await expect(alert(page)).toHaveText("Imported", { timeout: 20_000 });
```

A page from `createPage()` of `@nuxt/test-utils/e2e` keeps the Playwright defaults.

### Debug a browser test

```bash
nuxvel test:e2e --headed tests/e2e/posts.test.ts
nuxvel test:e2e --devtools tests/e2e/posts.test.ts
nuxvel test:e2e --debug tests/e2e/posts.test.ts
NUXVEL_SLOW_MO=250 nuxvel test:e2e --headed
```

The browser is headless by default. `--headed` shows it. `--devtools` shows it with the Chrome DevTools open in each tab. `--debug` shows it and opens the Playwright inspector. The inspector stops at the first browser operation. To stop at a line of a test, put `await page.pause()` on that line and run with `--debug`. With `--debug`, there is no browser timeout and no Vitest test or hook timeout, so a stopped test does not fail. `NUXVEL_SLOW_MO=<ms>` waits that many milliseconds before each browser operation. Give one test file, because each test file opens its own browser.

The flags set environment variables. Set them yourself to use them with `vitest` directly:

| Flag | Environment variable |
|---|---|
| `--headed` | `NUXVEL_HEADED=1` |
| `--devtools` | `NUXVEL_DEVTOOLS=1` |
| `--debug` | `PWDEBUG=1` |

A visible browser needs the full Chromium. Install it once with `npx playwright-core install chromium`. The starter's `npm run test:e2e` script installs only the headless browser.

### visit

`visit(target, options?)` opens the target in a new page and waits for hydration. It returns the Playwright page. Call it only in a test.

- The page opens signed out. `actingAs(user).visit(path)` opens it as that user.
- The options are the Playwright browser context options, for example a device or `colorScheme`, and three options of nuxvel: `status`, `clock` and `allowFailedRequests`. `clock: true` installs and pauses the browser clock before the page loads. See [Typing, timers and hover](#typing-timers-and-hover).
- The `locale` option, for example `"zh"`, opens the localized path of the target, for example `/zh/posts` for `/posts`. The browser also gets that locale, as with the Playwright `locale` option. `visit` finds the path with the router of the app, in one more page load.
- A page with `noScripts`, such as `/offline`, does not hydrate. `visit` does not wait for hydration on that page.

```ts
import { devices } from "playwright/test";

const page = await visit("/posts", { ...devices["iPhone 13"], colorScheme: "dark" });
```

`target` can be a route location. nuxvel turns on `experimental.typedPages`, so `{ name, params }` is typed: a page that moves or gets another name fails the typecheck. This holds in `tests/` too: the starter's `tests/tsconfig.json` includes `.nuxt/types/typed-router.d.ts`, so a test with `visit({ name: "no-such" })` fails `npm run typecheck`. A test that `nuxvel make:test --e2e` writes uses the route name of its page, so it typechecks once the page exists. `visit` resolves the location with the router of the app, in one more page load. A name that no page has fails with `visit: no page has the route name "no-such"`. `expectNoSmoke()` takes route locations in `extraPaths` too.

```ts
const page = await visit({ name: "posts-id", params: { id: post.id } });
```

`target` can also be a full URL, for example a link from a mail. `visit` opens the path, query and hash of the URL on the app under test. `expectMailSent()` returns the input of the mail, so a test can open the link of the mail:

```ts
const { url } = await expectMailSent("password-reset", { to: user.email });
const page = await visit(url);
```

`visit` records a page response with a status of 400 or more as an error. To open a page that must answer with such a status, for example the 404 page, give the `status` option. `visit` then fails the test when the page response has another status, and it does not record the response with that status as an error. Other errors still fail the test.

```ts
const page = await visit("/no-such-page", { status: 404 });
await expect(page.getByText("Page not found")).toBeVisible();
```

`visit` records a failed request as an error, also a request that the test aborts on purpose, for example with `page.route(..., (route) => route.abort())`. To allow such a request, give the `allowFailedRequests` option. Each item is a glob that matches the whole URL, as in `page.route`, or a `RegExp`. `visit` does not record a failed request that matches an item. Each other error still fails the test. `actingAs(user).visit` takes the same option.

```ts
const page = await visit("/posts", { allowFailedRequests: ["**/api/trpc/post.list*"] });
await page.route("**/api/trpc/**", (route) => route.abort());
```

Each `visit` opens a new browser context. To test two users on one page, for example presence, open the page two times as different users:

```ts
const anaPage = await actingAs(ana).visit(`/posts/${post.id}`);
const benPage = await actingAs(ben).visit(`/posts/${post.id}`);
```

`visit` records these errors on the page:

- page errors
- `console.error` messages, except the browser's own "Failed to load resource" line: the two rules below cover responses
- the page response, when its status is 400 or more, or when it differs from the `status` option
- other responses with a status of 500 or more
- failed requests, except those that match `allowFailedRequests`, and except an event stream (`EventSource`), such as the realtime `/api/channels`, that the page closes or leaves while it connects
- an error page (`error.vue`) with a status of 500 or more after hydration, for example after an error in `onMounted`

At the end of the test, `visit` fails the test with each recorded error. When the test fails, `visit` saves a full-page screenshot to `test-results/<file>/<test>.png`. When the test ends, `visit` closes the page, before the setup empties the tables. Thus a page of one test cannot send requests while the next test runs. Open the pages again in each test. A new app's `.gitignore` includes `test-results/`.

### Smoke tests

```ts
import { expectNoSmoke } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { postFactory } from "#nuxvel/factories";

describe("the app", () => {
  it("opens each page without errors", async () => {
    const post = await postFactory();

    await expectNoSmoke([`/posts/${post.id}`]);
  }, 60_000);
});
```

`expectNoSmoke(extraPaths?, options?)` reads the page routes from the router in the browser. It opens each route that has no params. It does not open a route with params, such as `/posts/[id]`. Give concrete paths for these routes in `extraPaths`. It does not open a route that is not a page. Nuxt adds a route to the router for each redirect in the route rules, for example the `/sitemap.xml` redirect of `@nuxtjs/sitemap` with two or more locales. `expectNoSmoke` does not open these routes.

A page fails when:

- `visit` records an error on the page
- the page status is 400 or more
- `expectAccessible` finds a violation on the page

`expectNoSmoke` opens all the pages first. Then it fails with a list of each page that failed and its errors. `options` are the `expectAccessible` options for each page, for example `disable`.

### login

```ts
// eslint-disable-next-line nuxvel/test-client -- login() signs in a page from createPage()
import { createPage, url } from "@nuxt/test-utils/e2e";
import { actingAs } from "@nuxvel/nuxt/testing";
import { userFactory } from "#nuxvel/factories";

const page = await createPage();
await actingAs(await userFactory()).login(page);
await page.goto(url("/posts/new"), { waitUntil: "hydration" });
```

`actingAs(user).login(page)` signs the user in on a page from `createPage()` without the sign-in form. It puts the session cookie in the page's browser context. The next navigation is signed in. `createPage()` and `url()` come from `@nuxt/test-utils/e2e`. Use `login` only for a page that `visit` cannot open, for example a page that must go offline, see [PWA](./pwa.md#testing). `npm run test:arch` flags the import of `createPage` with the rule `nuxvel/test-client`: turn the rule off for that import with an `eslint-disable-next-line` comment. In all other cases, use `actingAs(user).visit(path)`, which also records the errors of the page. To open a page with `visit` and abort a request on purpose, use the [`allowFailedRequests`](#visit) option.

## Accessibility

```ts
import { expectAccessible, visit } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";

describe("the posts page", () => {
  it("is accessible", async () => {
    const page = await visit("/posts");
    await expectAccessible(page);
  });
});
```

`expectAccessible(page)` runs [axe-core](https://github.com/dequelabs/axe-core) on a Playwright page. It fails on any WCAG 2.1 AA violation. A new app has `axe-core` as a dev dependency. In an older app, install it as a dev dependency. Without it, `expectAccessible` throws.

Call it in every end-to-end test after each page load. Call it again after a large change to the page, such as a menu or dialog that opens, or a form that shows errors.

You can check a page while a Nuxt UI toast is open. The check skips the two hidden, focusable elements that Nuxt UI adds next to open toasts to catch the Tab key.

A failure lists each rule, the elements that break it and a link to the fix:

```
label: Form elements must have labels
    input
    fix: https://dequeuniversity.com/rules/axe/4.13/label
```

```ts
await expectAccessible(page, {
  disable: { "color-contrast": "embedded map tiles are drawn by the provider" },
});
```

To skip a rule, give a reason in `disable`. Do this only for a third-party widget that you do not control. An empty reason throws.

`expectAccessible` first waits for the open and close animations to finish, because colours measured during a fade fail the contrast rule. It does not wait for endless animations, such as a spinner, or for the timer bar of a toast.

A story gets the same check without code: `@storybook/addon-a11y` runs axe after each story under `nuxvel test:ui`, with these rules. See [Storybook: accessibility](./storybook.md#accessibility).

## Type checking

```bash
npm run typecheck
```

A new app's `typecheck` script runs `nuxt typecheck`. It checks the app, server and shared programs. Vitest does not check types, so run it next to the tests.

The starter's `tests/tsconfig.json` extends the server program for everything under `tests/`, so the editor and the typecheck resolve these files with `Bundler`. A test next to the server code it covers is part of the server program. The `make:*` commands put tests there. The typecheck then also checks the fixtures, so a misspelled job name or a wrong column fails.

## Guidelines

- Put each check in the one layer that owns it. A functional test checks server behavior and never the HTML or the text of a page. A component test checks the states of one component. An end-to-end test checks a user journey.
- Import `expect` from `@nuxvel/nuxt/testing` in a test, and from `@nuxvel/nuxt/storybook/test` in a story. `npm run test:arch` checks this and the other test rules, see [`nuxvel test:arch`](./cli.md#nuxvel-testarch).
- Ship every behavior with a test that fails before the change and passes after it, in the same commit.
- Do not use `vi.mock` for the database or the routers. Use the real Postgres and the real router.
- Make `npm run typecheck` exit 0 before you commit.

## Fixture reference

| Fixture | Does |
|---|---|
| `signIn(email, password, { headers? })` | signs in through the sign-in endpoint, with `headers` on the sign-in and each later call, and returns `trpc`, `fetch`, `$fetch`, `visit`, `login`, `upload` and `listen` on that session |
| `actingAs(user, options?)` | returns `trpc`, `fetch`, `$fetch`, `visit`, `login`, `upload` and `listen` that run as that user |
| `guest({ locale? })` | returns `trpc`, `fetch`, `$fetch`, `visit`, `upload` and `listen` with no session |
| `expectRefused(router, code)` | checks that every procedure of a router refuses the caller with that tRPC code |
| `runAction(name, input, { actingAs })` | calls an action as that user, or with `{ asSystem: name }` as a system actor |
| `runJob(name, input, { actingAs }?)` | runs a job's handler now, as nobody or as that user |
| `runListener(name, payload)` | runs a listener's handler now |
| `workQueue()` | runs every queued job and queued listener |
| `deliverWebhook(name, body)` | sends a signed delivery to a webhook |
| `client.upload(name, file)` | uploads a file through the upload route as the client of `actingAs()` or `guest()`, and returns the `tmp/` key |
| `client.listen(channels, { lastEventId? })` | opens a channel stream as the client, with a replay from `lastEventId`, and returns `{ channels, refused, next(event?), close() }`. `next("created")` skips the other events, such as the `presence.*` events of a room |
| `expectStored(key)` | asserts that the bucket holds an object at `key`, and returns its content type and size |
| `expectNotStored(key)` | asserts that the bucket holds no object at `key` |
| `emit(name, payload)` | emits an event in a transaction |
| `renderMail(name, input)` | renders a mail's subject, HTML and text without sending it |
| `sendNotification(users, name, data)` | sends a notification in a transaction |
| `runBackfill(name)` | runs a backfill to completion |
| `runSeeder(name)` | runs a seeder and the seeders that it calls |
| `runSchedule(name)` | runs one tick of a schedule now |
| `can(user, action, table, row)` | asks the app's policy whether the user may do the action on the row |
| `exhaustRateLimit(limit, identity)`, `exhaustRateLimit(procedure)` | spends every attempt of a shared rate limit for `{ user }`, `{ ip }` or a key string, or the inline `rateLimit()` of a procedure of a test client |
| `signedUrl(path, { expiresIn })` | signs a path with the app's secret |
| `totpCode(totpURIOrSecret)` | returns the current 6-digit code of a TOTP URI, of the base32 setup key that a page shows (spaces ignored) or of a raw TOTP secret, at the time of the test clock. A secret made only of base32 letters and digits (upper-case A–Z and 2–7) is read as a setup key |
| `expectCached(key)` | asserts the app's cache holds a value for the key and returns it |
| `setFlagTargeting(name, targeting)` | replaces a flag's targeting in the app |
| `enableFlag(name)`, `disableFlag(name)` | turns a flag on or off for every user in the app |
| `startExperiment(name)`, `stopExperiment(name)` | starts or stops an experiment in the app |
| `forceVariant(name, variant)` | runs an experiment with every user in one variant |
| `startMaintenance(options?)`, `stopMaintenance()` | puts the app in maintenance mode or takes it out. See [Maintenance mode](./maintenance.md#testing) |
| `expectRow(table, match)` | asserts a matching row exists and returns it |
| `expectNoRow(table, match)` | asserts no row matches |
| `expectSoftDeleted(table, match)` | asserts a soft-deleted row matches and returns it |
| `expectCount(table, n, match?)` | asserts exactly `n` rows match |
| `expectAudited(action, match?)` | asserts a matching `audit_log` row exists and returns it |
| `expectNotAudited(action, match?)` | asserts no matching `audit_log` row exists |
| `expectPresent(channel, params, user)` | asserts a user is a member of a presence room and returns the member |
| `expectNotPresent(channel, params, user)` | asserts a user is not a member of a presence room |
| `captureQueries(fn)` | returns the SQL of the queries the app ran for the calls in `fn` |
| `expectConstantQueries(fn, sizes?)` | asserts the query count does not grow with input size |
| `expectQueryCount({ max }, fn)` | asserts the app runs at most `max` queries for `fn` |
| `visit(target, options?)` | opens a page signed out and fails the test on page errors |
| `expectNoSmoke(extraPaths?, options?)` | opens each page and fails on errors, bad statuses and accessibility violations |
| `getMeta(path)` | returns the head tags of a page's server render. See [SEO](./seo.md#testing) |
| `expectAccessible(page, options?)` | asserts a page has no WCAG 2.1 AA violations |
| `button`, `link`, `heading`, `field`, `text`, `cell`, `dialog`, `menu`, `menuitem`, `alert`, `toast` | find an element by what the screen shows. See [Find elements](#find-elements) |
| `trpcSpy(page, path)` | returns a `vi.fn()` that records the tRPC calls of the page to `path`. See [tRPC calls](#trpc-calls) |
| `fillForm(scope, values)` | fills each field found by its label, including the Nuxt UI controls |
| `expect` | the `expect` of Playwright for a locator or a page, with the [layout assertions](#layout-assertions), and the `expect` of Vitest for any other value. See [expect](#expect) |
| `expectEmitted`, `expectNotEmitted`, `expectListenerRan`, `expectNoListenerRan`, `expectListenerQueued` | assertions on emits and listeners |
| `expectQueued`, `expectNotQueued` | assertions on the queue fake |
| `expectMailSent`, `expectNoMailSent` | assertions on the mail fake |
| `expectWebhookSent`, `expectNoWebhookSent` | assertions on the webhooks that `sendWebhook()` queued |
| `expectNotified`, `expectNotNotified` | assertions on the notifications that `notify()` sent |
| `expectPolicyChecked`, `expectActionCalled` | assertions on policy decisions and action calls |
| `expectErrorReported`, `expectNoErrorReported`, `expectLogged` | assertions on reported errors and log lines |
| `expectBroadcast`, `expectNotBroadcast`, `expectCacheHit`, `expectCacheMiss` | assertions on broadcasts and cache lookups |
| `expectPushSent`, `expectNoPushSent`, `fakePush` | assertions on push notifications and the fake push service |
| `useRealQueue()` | turns off the queue fake for the file |
| `fakeFetch(responses)`, `expectFetched(url, options?)`, `expectNotFetched(url, options?)` | fake outbound requests and assert on them |
| `fakeStripe(options?)` | sets the prices of the in-memory Stripe of a test build, and what its test Checkout page does. See [Stripe](#stripe) |
| `completeCheckout`, `renewSubscription`, `failRenewal`, `cancelSubscription`, `refundPayment`, `disputePayment`, `expectSubscribed`, `expectNotSubscribed`, `expectPaid`, `expectNotPaid` | pay, change subscriptions and refund through the real Stripe webhook, and assert on them. See [Stripe](#stripe) |
| `travelTo(date)`, `travelBy(duration)`, `freezeTime(date?)` | move or stop the app's clock |

## See also

- [Database](./database.md)
- [Actions](./actions.md)
- [API](./api.md)
- [Queues](./queues.md)
- [Events](./events.md)
- [Mail](./mail.md)
- [Notifications](./notifications.md)
- [Audit log](./audit.md)
- [CLI reference](./cli.md)
