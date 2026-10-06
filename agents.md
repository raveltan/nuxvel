# nuxvel — agent instructions

nuxvel is a Nuxt module + CLI that gives a fresh Nuxt app a production-ready
backend: database, typed API, validation, auth, and actions, on day one.
It is a thin layer over proven libraries (Drizzle, tRPC, Zod, Better Auth),
not a framework that hides Nuxt.

## Ground rules

- **One change per commit.** Do not batch unrelated changes into one
  commit.
- **Every change that adds behavior ships with a test in the same commit.**
  No code without a failing-then-passing test. No test without code it
  exercises.
- **No comments in code, ever** — except a one-line comment directly above a
  genuine hack (a workaround for a specific library bug, an unintuitive
  ordering requirement, a non-obvious constraint). If removing the comment
  wouldn't confuse the next reader, delete it. Names, types, and function
  boundaries carry the meaning. This rule is about explaining code *to the
  next maintainer* — TSDoc on the public API is a separate thing, see below.
- **Every public API surface ships with a TSDoc block, always.** A public
  surface is anything user code can reach: an auto-imported helper, a
  `defineXxx`, a procedure builder, a composable, an error class, a test
  fixture or factory, an exported type, a module config option. Adding or
  renaming one without its TSDoc is an incomplete commit, exactly like
  shipping it without a test or without its `docs/` page.
  - Open with one sentence saying what it is, in the present tense.
  - Then only what the signature cannot say: when to reach for it, what it
    throws, whether it is auto-imported, what it does implicitly (joins the
    ambient transaction, needs an actor in context, runs after commit).
  - `@param` only for arguments whose meaning isn't obvious from the name,
    and for every option in an options bag.
  - `@example` with a realistic call for anything a user writes by hand.
    Skip it for a one-line predicate or a plain error class.
  - Link siblings with `{@link other}` — the hover is where users discover
    the neighbouring API.
  - Keep it short. It is reference material, not rationale. Walkthroughs
    live in `docs/`.
  - Internal helpers inside a file stay undocumented. The no-comments rule
    still governs everything below the doc block.
- **nuxvel is a framework: every change reaches the generated app.** The
  point of this repo is what an app made with `create-nuxvel` gets. A
  change made for the repo's own workflow (the playground, `npm run dev`,
  the test setup) that an app would want too ships to apps in the same
  commit: through `@nuxvel/nuxt`, `@nuxvel/cli` or
  `packages/create/template/`, with its test and its `docs/` page. Never
  fix it only for this repo.
- **Apps made with nuxvel already exist, and every release must reach
  them.** An app gets `@nuxvel/nuxt` and `@nuxvel/cli` updates through
  `npm update`; the files of `packages/create/template/` were copied once
  and never update. So a fix or feature lives in the packages, not only
  in the template. A change an existing app cannot take by upgrading the
  packages alone is a breaking change: a renamed or removed API, config
  key, file convention or CLI flag, a new required env var, migration or
  config line, or a template change the app must copy by hand. Avoid one
  when an additive path exists (keep the old name working beside the
  new). When it cannot be avoided, the same commit adds an entry under
  `## Unreleased` in `CHANGELOG.md` with the exact steps an app takes to
  upgrade. A non-breaking user-visible change gets a one-line entry
  there too. The release commit renames `## Unreleased` to the version.
  While nuxvel is `0.x`, `^0.2.0` stops at `0.3.0`, so a breaking
  release bumps the minor version and a fix bumps the patch.
- **The framework assumes nothing about the app's own code.** The
  starter's files (seeders, demo user, pages) belong to the app once it
  is generated, and the app may change or delete them. The CLI and the
  module never read, print or depend on what a starter file contains.
- **YAGNI.** Build exactly what the current change asks for. No
  extra config options, no hooks for hypothetical future features, no
  abstraction until a second real caller needs it.
- **No DI container, no service classes, no active-record models.** Plain
  functions, plain objects, auto-imports.
- **Generators only create files.** Never edit an index/barrel file
  programmatically — auto-discovery replaces registration everywhere.
- **Small files, one purpose each.** One action per file, one job per file,
  one router per domain. Prefer three similar small files over one shared
  abstraction used twice.

## Docs

User-facing documentation lives in `docs/` (one guide per topic, see
`docs/index.md`); `README.md` is the entry point. **Always update the
docs in the same commit as the feature they describe.** Any change
that adds, changes, or renames a public API (auto-imported helper,
procedure builder, fixture, config option, file-convention folder) must
also update the relevant page in `docs/`. Docs are kept deliberately
small: simple examples, no internal rationale.

## Repo layout

```
nuvel/
  packages/
    nuxt/     # @nuxvel/nuxt — the Nuxt module
    cli/      # @nuxvel/cli  — `nuxvel` binary
    create/   # create-nuxvel — project scaffolder
    test-helpers/ # @nuxvel/test-helpers — private helpers the three test suites share
  playground/ # real Nuxt app, exercised by tests and used for manual checks
  docs/       # user-facing guides (database, api, actions, auth, testing, ...)
  agents.md
```

No Bun anywhere: apps, the CLI, tests and repo
tooling all run on Node.js. No `Bun.*` or `bun:*` in any code, no
`bun`/`bunx` in scripts, tests or docs. Install, test and typecheck
with `npm install`, `npm test`, `npm run typecheck`.

npm workspaces, no extra monorepo tool. Root `package.json` lists `packages/*`
(the three published packages and the private `test-helpers`) plus
`playground` as workspaces.

## Naming

Framework name: **nuxvel**. Packages: `@nuxvel/nuxt`, `@nuxvel/cli`,
`create-nuxvel`. CLI binary: `nuxvel`. Config key in `nuxt.config.ts`:
`nuxvel: { ... }`.

## Current scope

Shipped: database (Drizzle + Postgres) with pagination, full-text
search, soft deletes and seeders, validation (Zod), tRPC API with
OpenAPI and API keys, actions, auth (email and password with email
verification, password reset and two-factor sign-in, plus social login
through `nuxvel.auth.social`), policies, the audit log, queues with the
transactional outbox behind `$jobs.x.dispatch()`, schedules, cache,
mail with Vue templates rendered through MJML, notifications, object storage, webhooks,
billing with Stripe (opt-in `nuxvel.billing`: subscriptions and one-time
payments through Checkout and the Customer Portal, an in-memory Stripe
in test builds),
realtime with presence, domain events, backfills, feature flags,
maintenance mode, SEO, i18n with nuxt-i18n-micro (English and Chinese
in the starter, with the locale in SEO, the sitemap, mail, validation
and Storybook), PWA and web push, the Nuxt UI components,
architecture rules (`nuxvel test:arch`), DevTools, error tracking,
Storybook (with the nuxvel stories and MSW mocks of tRPC and the
session), the starter and `nuxvel build`. Also shipped: file names with a kind
suffix (`create-task.action.ts`, `task.policy.ts`), auto-imported `$`
namespaces (`$jobs`, `$mails`, `$policies`, ...) and definition
references for go-to-definition, `Table`/`Row`/`Input` names
(`taskTable`, `TaskRow`, `createTaskInput`), domain folders
(`server/domains/<domain>/`), modules as Nuxt layers (`layers/<name>/`),
`nuxvel services` and interactive CLI prompts. Also shipped:
deployment to a VPS (server setup, blue-green deploys with expand/contract
migrations, backups with an erasure log, restores and rehearsals,
monitoring, `tinker <env>` and the `make:ci` workflow). Not built yet:
publishing the `nuxvel/deploy-action` repository.

## Types

Types are a deliverable, not a by-product. `npm run typecheck` (root, runs the
`typecheck` script of `packages/nuxt`, `packages/cli`, `packages/create`,
`packages/test-helpers` and `playground`) must exit 0 before every commit,
alongside the tests.

- **Never declare a generated module with a shorthand ambient
  declaration.** `declare module '#nuxvel/schema';` with no body types
  every import from it as `any`, and that `any` spreads silently — it is
  what made `$api` untyped in `.vue` files. `addTypeTemplate(...,
  { nitro: true })` has the same problem from the other side: it reaches
  the nitro program only, so the app program sees nothing at all.
- **A generated module is registered twice, on purpose.** The same
  `getContents` goes to `addServerTemplate` (nitro's in-memory virtual,
  what nitro actually bundles) and to `addTemplate({ write: true })`,
  whose `dst` goes in `nuxt.options.nitro.alias` and, through
  `prepare:types`, the app tsconfig `paths` (what both programs
  typecheck against). Never in `nuxt.options.alias`: Vite would then
  resolve it and bundle server code into the app. Nitro's virtual
  resolves before its alias, so runtime never reads the file. Do not
  move runtime resolution onto the written file: `@nuxt/test-utils`
  shares one build dir across parallel workers and that file can
  vanish mid-build.
- **`any` at a public boundary is a bug.** An auto-imported helper, a
  procedure builder, `$trpc`, a fixture — if it lands as `any` in user
  code, fix the typing rather than casting at the call site.
- **Prove it with a type-level check, not a comment.** A degraded type
  passes every runtime test.
  `packages/nuxt/test/fixtures/probes/app/pages/_trpc-type-check.vue`
  is the pattern: assert `IsAny<T> extends true ? never : true`, and the
  typecheck gate catches the regression. The playground `typecheck`
  script sets `PLAYGROUND_PROBES_LAYER=1`, so it checks the probes
  layer too.
- **A linked app checks the framework's source.** With the stub build,
  `@nuxvel/nuxt` points to `src/`, and the app's `nuxt typecheck` checks
  those `.ts` files as the app's own, with the registries of the app. A
  starter has no event, upload, policy or flag, so each `#nuxvel/*`
  registry is `never[]`: framework code that reads a registry must
  widen it first (`const registered: readonly Policy[] = policies`). The
  `create.test.ts` test typechecks a linked starter.
- **`noUncheckedIndexedAccess` stays on.** Destructuring `.returning()`
  or a `select()` result yields `T | undefined` — use `firstOrFail` or
  narrow explicitly. Never turn the flag off and never reach for `!`.
- **A cast needs the same justification as a comment** (see the no-
  comments rule): only for a specific library-typing bug, with the
  one-line reason above it.
- Every dependency a package imports is declared in its own
  `package.json`. Relying on workspace hoisting produces TS2307 that only
  some machines see.

## Testing

Three layers, one rule each. A functional test (Vitest, real Postgres,
in-process tRPC caller) checks server behavior only: the result or error of
a procedure, the rows, the jobs, the mail, the status and `location` of a
response, the head tags from `getMeta()`. It never checks the HTML or the
text of a page. A component test is a Storybook story with a `play`
function: it checks the states of one component with `mockTrpc` and
`mockUser`. An end-to-end test (Playwright) checks a user journey with
`visit()`. A check goes in the one layer that owns it. Scripts of a
generated app: `test` (functional, then ui), `test:functional`, `test:ui`,
`test:e2e` and `test:arch`. Only the functional layer takes part in
`--changes-only` and `--watch`. Each layer has one `expect`: the one of
`@nuxvel/nuxt/testing` (functional and e2e) or of
`@nuxvel/nuxt/storybook/test` (stories), never from `vitest`,
`playwright/test` or `storybook/test`. The locator helpers (`button`,
`field`, `fillForm`, ...) and `trpcSpy` have the same names in both browser
layers (`docs/testing.md#component-tests` has the table). Timers: e2e uses
`visit(..., { clock: true })`, a story types with a real `delay`. Tests with
other data use `it.for`. `nuxvel test:arch` flags a functional test that
reads page HTML and a forbidden `expect` import, and
`packages/nuxt/test/arch/functional-page-html.test.ts` runs the page HTML
rule over this repo, where only the tests of the allowed server-rendered
output below may read page HTML, and
`packages/nuxt/test/arch/test-expect-import.test.ts` runs the same check
over `packages/nuxt/test` (a `*.nuxt.test.ts` file keeps the `expect` of
`vitest`: `@nuxvel/nuxt/testing` does not load in the nuxt environment).
It also flags `it.each` and `it()` in a loop (`nuxvel/test-each`), and
`packages/nuxt/test/arch/test-each.test.ts` runs that rule over the tests
of every package, the template and the playground. A test gets its user
from a factory with `actingAs()` or `signIn()`, never from a sign-up over
HTTP in a helper or a hook (`nuxvel/test-auth`, run over this repo by
`packages/nuxt/test/arch/test-auth.test.ts`; the auth-flow tests keep
their raw sign-up). A test reaches the app with `guest()`, `actingAs()`
and `visit()`, never with `$fetch`, `fetch` or `createPage` of
`@nuxt/test-utils/e2e` (`nuxvel/test-client`, run over this repo by
`packages/nuxt/test/arch/test-client.test.ts`, which lists the files that
keep `createPage` for a page `visit()` cannot open). There is no separate
unit-test layer for application code. This
holds for the playground and for the framework tests. A framework test in
`packages/nuxt/test` may check HTML when the feature is server-rendered output:
the error page, SEO and head tags, `SafeHtml`, hydration and mail HTML. The framework
packages themselves (`packages/nuxt`, `packages/cli`) are exercised against
`playground/` the same way: write a functional test in `packages/nuxt/test/`
(or `packages/cli/test/` for a command) that proves the feature works, don't
test module internals in isolation. Tests are there to catch breakage:
keep them correct and quick.

- `packages/nuxt`: the global setup starts `docker-compose.test.yml`,
  builds the template database and builds the playground **once**. The
  playground build goes through the same build cache as an app's
  `@nuxvel/nuxt/testing/global-setup` (`src/testing/test-build.ts`,
  kept in `playground/node_modules/.cache/nuxvel/test/`): a run uses the
  cached build again until a playground file, the probes layer, a file
  of `packages/nuxt` or `packages/cli` outside `test/`, or an
  environment variable changes. Two runs that need the same build
  build it once. `#nuxvel/test-namespaces` resolves to
  `playground/.nuxt/`, which `nuxt prepare` writes, as in an app. A
  file that needs a plain playground server calls `setupPlayground()`
  (`test/helpers/playground.ts`), never `setup()` with its own build. A
  file that must build its own playground or scratch app calls
  `setupApp()` from the same helper, never `setup()` directly: tests
  are hermetic from a developer's git-ignored `playground/.env`. The
  shared build loads no dotenv, and `setupApp()` drops the keys
  `loadNuxt` copied from the app's `.env` before the server starts, and
  the services global setup removes `CLAUDECODE` and
  `CLAUDE_CODE_CHILD_SESSION`, with which the Stripe SDK prints a hint
  on a command's stderr. A
  dev server (`nuxi dev`) still reads `.env` itself, so a value a test
  depends on is passed explicitly in the env. Every own build costs
  about 20 s, so a test that needs a dev server of the playground adds
  a suite under `test/dev-server/` (run by `dev-server.test.ts` on one
  shared server), and a test that needs a bare scratch app adds a suite
  and a fixture writer under `test/scratch-app/` (built once by
  `scratch-app.test.ts`), or under `test/dev-scratch-app/` when it
  needs a dev server of one (`dev-scratch-app.test.ts`). A
  Nitro-side probe scenario runs once per file with `runProbeOnce()`.
  `*.nuxt.test.ts` files run in the nuxt environment project.
- Framework probes (the `_*-check` API routes, the `_*` test pages and
  the `_*-type-check` files) live in a Nuxt layer,
  `packages/nuxt/test/fixtures/probes/`. The shared playground build
  and the dev-server options extend it (a `nuxi dev` child gets it
  through `PLAYGROUND_PROBES_LAYER=1`). The CLI tests do not use it.
  `_`-prefixed definitions that stand in for app code (jobs, events,
  channels, routers, ...) stay in the playground, and its
  `nuxt.config.ts` leaves them out of a build that is not for tests.
- Test services are separate from dev services. `docker-compose.test.yml`
  keeps Postgres and SeaweedFS on tmpfs. `docker-compose.yml` holds only
  the dev services, and `npm run dev` starts them and stops them when
  it exits. Each Vitest worker
  clones the template database and gets its own Redis database index.
  After each test, the setup truncates every table the test touched.
  Test files run in parallel.
- Parallel runs (another worktree, another agent) each get their own
  services: set `NUXVEL_TEST_COMPOSE_PROJECT` (compose project name,
  default `nuxvel-test`) and the five test URLs, whose ports the nuxt
  and cli global setups publish the services on (defaults in brackets):
  `NUXT_DATABASE_TEST_URL` (`postgres://nuxvel:nuxvel@localhost:5433/postgres`),
  `NUXT_REDIS_TEST_URL` (`redis://localhost:6380`),
  `NUXT_MAIL_TEST_URL` (`smtp://localhost:1026`),
  `NUXT_MAILPIT_TEST_URL` (`http://localhost:8026`),
  `NUXT_STORAGE_TEST_URL` (`http://nuxvel:nuxvel-secret@localhost:8334`).
  A run that starts the stack stops it (`docker compose down`) when
  it ends. A run that finds each service of the project healthy and
  created from the current `docker-compose.test.yml` uses it and
  leaves it running (a stack from an older file is recreated), so to skip the start-up while iterating,
  start it yourself with `docker compose -f docker-compose.test.yml -p
  <project> up -d --wait` and stop it with `down` when you are done.
- `packages/cli`: one file per command group; each test gets its own
  database (`scratchDatabase()`) and Redis index (`emptyWorkerRedis()`).
  Tests that only run commands share one scratch copy of the playground
  per file (`sharedPlayground()`), so its server builds once; a test
  that edits app files takes its own (`scratchPlayground()`). Never run
  a command in the real `playground/`. A test runs a command through
  `runCli*` (`test/helpers/run.ts`), a long-running one (`dev`,
  `queue:work`, `tinker`) through `startCli()` and `db:migrate` through
  `migrate()` of `@nuxvel/test-helpers/cli`, and opens its database
  connection with `scratchSql()` of `@nuxvel/test-helpers/sql`, which
  closes it when the test ends. Never spawn the CLI by hand.
- Type-level "fails to compile" checks belong in `npm run typecheck`
  (`test/type-fixtures`), not in a test that spawns `tsc`.
- No fixed sleeps: wait on an event, a locator or fake timers.

`npm test` in `packages/nuxt` runs `pretest` first. It needs `dist/` to be
the stub that `npm run dev:prepare` writes, which points to `src/`: a leftover
full `nuxt-module-build build` makes tests load compiled code. `pretest`
(`scripts/ensure-stub.mjs`) reads `dist/module.mjs` and builds the stub only
when `dist/` is not one already. A stub never needs a new build for a source
change, so parallel runs never delete `dist/` under each other. Never run a
plain `nuxt-module-build build` there while tests run. A new package entry
still needs `npm run dev:prepare`.

Run tests before every commit. A step is not done until its test passes.

**Run only the changed tests** while working (`npx vitest run <file>...`
in the relevant workspace). The full `npm test` took 9 minutes
(nuxt 4.6, cli 3.0, create seconds; measured 2026-09-25 at load
average 31-39 from other agents, so expect less on an idle machine);
`npm run test:release` adds the docker image build, the
`create-nuxvel` install check and the VPS check and runs before a
release.
The VPS check, also `npm run test:deploy` on its own
(`packages/cli/test/deploy.release.test.ts`), runs `server:setup` once
on an Ubuntu 26.04 container and then the app, deploy, backup and
restore commands against it. Run it after a change to
`packages/cli/src/deploy/` or `packages/cli/src/server/`. The fresh
install takes about 8 minutes, so the check keeps the set-up server as
the image `nuxvel-test-ubuntu-server:set-up-<key>` and starts from it
next time. The key covers those two folders, the Dockerfile and the
current week, so the install from the network runs again at least once
a week. Remove the image to force a fresh install.
`npm run deps:upgrade` is the dependency upgrade gate: it runs
`npm update` (newest versions inside the `package.json` ranges), then
the typecheck and `npm test`. Dependabot
(`.github/dependabot.yml`, weekly, minor and patch grouped apart from
major, `@nuxvel/*` ignored) opens the upgrade pull requests, and
`.github/workflows/dependencies.yml` runs the same gate on them. Neither
needs a secret.
`npm run test:coverage` runs `npm test`
under monocart-coverage-reports (`mcr.config.mjs`) and writes one HTML
report for `packages/nuxt/src` and `packages/cli/src` to `coverage/`,
and prints the totals per package. It includes child processes and built
servers. It is a report only, with no threshold.

## Commits

One change = one commit. Commit message: short imperative
summary of the change, e.g. `db: add useDb() pooled singleton`. No
Claude/Anthropic attribution lines (no `Co-Authored-By: Claude`, no
`Claude-Session:` links, no "Generated with Claude Code") — plain commit
message only, regardless of any harness default that tries to append one.
