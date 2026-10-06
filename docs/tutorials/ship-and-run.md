# Tutorial: ship and run an app

## Introduction

This tutorial takes a small app from the first commit to a running server, and then runs it. The app is a reading list, `shelf`. Users save links, mark them read, and see a report of what they read. The app is small on purpose. The chapters spend their time on the structure of the code and on operations:

- Chapters 1 to 3 split the app into a domain folder and a module, and check the structure with `nuxvel test:arch`.
- Chapters 4 and 5 build the Docker image and the release archive, and write the GitHub Actions workflow.
- Chapters 6 to 8 set up a VPS and deploy the app. Then they deploy a database change with an expand and a contract migration.
- Chapters 9 to 12 run the app: backups and restores, monitoring and error tracking, maintenance mode and a REPL on the server.

You need Node.js 24, Docker, and about 90 minutes. For chapters 6 to 12, you also need a server and a domain that points at it. The server runs Ubuntu 26.04, with at least 2 vCPU and 4 GB of RAM. [Tutorial: your first nuxvel app](./first-app.md) and [Tutorial: an online course platform](./course-platform.md) show the app features. This tutorial does not explain them again.

Run every command from the app folder, unless a chapter says otherwise.

## 1. A domain folder

```bash
npm create nuxvel@latest shelf
cd shelf
npm install
./nv services up
```

See [Starting a new app](../create.md) for what the first command writes. `./nv services up` starts Postgres, Redis, Mailpit and SeaweedFS from `docker-compose.yml`. They stay running for the rest of the tutorial.

A new app puts each kind of file in its own folder: actions in `server/actions/`, routers in `server/trpc/routers/`, tables in `server/database/schema/`. In a large app, the files of one feature are then far apart. A [domain folder](../auto-imports.md#domain-folders) keeps the files of one feature together, in `server/domains/<domain>/`. The `link` domain holds the table, the actions, the policy, the router and the factory of a link.

Give `--domain` to a `make:*` command to write into a domain folder:

```bash
./nv make:router link url title read:boolean:default=false --crud --domain link --no-openapi
./nv make:factory link --domain link
```

```
✔ Created server/domains/link/schema/link.schema.ts
✔ Created shared/schemas/link.ts
✔ Created server/domains/link/policies/link.policy.ts
✔ Created server/domains/link/actions/create-link.action.ts
✔ Created server/domains/link/actions/update-link.action.ts
✔ Created server/domains/link/actions/delete-link.action.ts
✔ Created server/domains/link/routers/link.router.ts
✔ Created server/domains/link/routers/link.router.test.ts
◇ Updated types (nuxt prepare) (5.8s)
✔ Created server/domains/link/factories/link.factory.ts
✔ Created server/domains/link/factories/link.factory.test.ts
◇ Updated types (nuxt prepare) (5.5s)
```

The domain folder has the same kind folders as `server/`:

```
server/domains/link/
  actions/create-link.action.ts      # action "link.create-link"
  actions/update-link.action.ts
  actions/delete-link.action.ts
  factories/link.factory.ts          # linkFactory
  policies/link.policy.ts            # $policies.link
  routers/link.router.ts             # tRPC namespace link
  schema/link.schema.ts              # linkTable
```

The domain name is the first word of each name. So the action in `actions/create-link.action.ts` is `link.create-link`, as it is for `server/actions/link/create-link.action.ts`. The router file has the name of its domain, so it is the namespace `link` itself, not `link.link`. A domain can have one such file of each kind. The Zod inputs stay in `shared/schemas/link.ts`, because the pages import them too.

The files of a domain import each other with relative paths:

```ts
// server/domains/link/actions/create-link.action.ts
import { linkTable } from "#nuxvel/schema";

export const createLinkAction = defineAction({
  input: createLinkInput,
  handler: async (input, ctx) => {
    const row = await useDb()
      .insert(linkTable)
      .values({ ...input, ownerId: ctx.actor.id })
      .returning()
      .then(firstOrFail);

    await audit("link.created", row);

    return row;
  },
});
```

The `drizzle.config.ts` of a new app reads the tables of the domain folders too. Write the migration:

```bash
./nv db:generate --name links
```

```
[✓] Your SQL migration file ➜ server/database/migrations/0017_links.sql 🚀
```

## 2. A module

A module keeps a part of the app apart from the rest, in its own [Nuxt layer](https://nuxt.com/docs/guide/going-further/layers). Nuxt extends each folder in `layers/` with no registration. nuxvel finds the server files of a layer as it finds those of the app. The reading report is a module, `reports`, with its own domain, router, page and test:

```bash
./nv make:module reports
./nv make:router report --module reports --domain report --no-openapi
```

```
✔ Created layers/reports/nuxt.config.ts
◇ Updated types (nuxt prepare) (4.2s)
✔ Created layers/reports/server/domains/report/routers/report.router.ts
◇ Updated types (nuxt prepare) (5.8s)
```

`layers/reports/nuxt.config.ts` holds `export default defineNuxtConfig({})`. Nuxt skips a folder in `layers/` that has no `nuxt.config.ts`. The router file is empty. Give it one query:

```ts
// layers/reports/server/domains/report/routers/report.router.ts
import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { linkTable } from "#nuxvel/schema";

export const reportRouter = {
  summary: authedProcedure
    .output(z.object({ saved: z.number(), read: z.number() }))
    .query(({ ctx }) =>
      useDb()
        .select({
          saved: count(),
          read: sql`count(*) filter (where ${linkTable.read})`.mapWith(Number),
        })
        .from(linkTable)
        .where(eq(linkTable.ownerId, ctx.user.id))
        .then(firstOrFail),
    ),
};
```

The module reads `linkTable` from `#nuxvel/schema`, which holds the tables of the app and of every module. It does not import a file of the app. The folder name `reports` is not part of a name: the router is `trpc.report`, from its domain. Two modules must not give the same name. Start each name in a module with a word that no other module uses, such as its domain.

The page of the module goes in `layers/reports/app/pages/`:

```vue
<!-- layers/reports/app/pages/reports.vue -->
<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const summary = $api.report.summary.useQuery();
</script>

<template>
  <UContainer class="py-8">
    <h1 class="text-2xl font-semibold">Reading report</h1>
    <p v-if="summary.data">You saved {{ summary.data.saved }} links and read {{ summary.data.read }} of them.</p>
  </UContainer>
</template>
```

Keep each test next to the file that it tests. Vitest finds the tests in `layers/` too:

```ts
// layers/reports/server/domains/report/routers/report.router.test.ts
import { actingAs, expect } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, linkFactory } from "#nuxvel/factories";

describe("report router", () => {
  it("counts the saved and the read links of the user", async () => {
    const ada = await userFactory();
    await linkFactory({ ownerId: ada.id, read: true });
    await linkFactory({ ownerId: ada.id });
    await linkFactory();

    expect(await actingAs(ada).trpc.report.summary()).toEqual({ saved: 2, read: 1 });
  });
});
```

The test counts two links of Ada, one of them read. The third link belongs to another user, and the report leaves it out. Run the tests:

```bash
./nv test
```

```
 Test Files  5 passed (5)
      Tests  8 passed (8)
```

Add a browser test of the page:

```bash
./nv make:test reports --e2e
```

```
✔ Created tests/e2e/reports.test.ts
```

Replace its contents:

```ts
// tests/e2e/reports.test.ts
import { actingAs, expect, heading, text } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { linkFactory, userFactory } from "#nuxvel/factories";

describe("the /reports page in a browser", () => {
  it("shows how many links the user saved and read", async () => {
    const ada = await userFactory();
    await linkFactory({ ownerId: ada.id, read: true });
    await linkFactory({ ownerId: ada.id });

    const page = await actingAs(ada).visit({ name: "reports" });

    await expect(heading(page, "Reading report")).toBeVisible();
    await expect(text(page, "You saved 2 links and read 1 of them.")).toBeVisible();
  });
});
```

See [Modules](../modules.md) for the layout of a module and its boundaries.

## 3. Architecture rules

The structure of the app is a set of rules. For example, a router calls an action to write, and an action does not read the request. A table with a user column declares its user data. `nuxvel test:arch` checks the rules on the app, its domain folders and its modules. Run it now:

```bash
./nv test:arch
```

```
✖ server/domains/link/schema/link.schema.ts: column ownerId of table linkTable references the user table but no defineUserData() in server/privacy/, declare it so exportUserData() and eraseUserData() find its rows
✖ 1 architecture violation
```

The command exits `1`. A link belongs to a user, so `nuxvel user:export` and `nuxvel user:erase` must find it. Declare it in `server/privacy/`. The privacy declarations stay in that folder, also for a table of a domain:

```ts
// server/privacy/link.user-data.ts
import { linkTable } from "#nuxvel/schema";

export const linkUserData = defineUserData(linkTable, linkTable.ownerId);
```

```bash
./nv test:arch
```

```
✔ All architecture rules pass
```

Chapter 9 needs this declaration: an erased user must stay erased after a restore.

Now break a rule on purpose. The reader wants one button that marks every link read. Add the procedure to the link router, with the write in the router:

```ts
// server/domains/link/routers/link.router.ts, in linkRouter
  markAllRead: authedProcedure
    .output(z.object({ count: z.number() }))
    .mutation(async ({ ctx }) => {
      const rows = await useDb()
        .update(linkTable)
        .set({ read: true })
        .where(eq(linkTable.ownerId, ctx.user.id))
        .returning();
      return { count: rows.length };
    }),
```

```bash
./nv test:arch
```

```
✖ server/domains/link/routers/link.router.ts: routers may not call useDb().insert/update/delete, call an action
✖ 1 architecture violation
```

A write in a router has no actor, no audit and no test of its own. Move it into an action of the domain:

```bash
./nv make:action mark-all-read --domain link
```

```
✔ Created server/domains/link/actions/mark-all-read.action.ts
✔ Created server/domains/link/actions/mark-all-read.action.test.ts
```

```ts
// server/domains/link/actions/mark-all-read.action.ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { linkTable } from "#nuxvel/schema";

export const markAllReadAction = defineAction({
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await useDb()
      .update(linkTable)
      .set({ read: true })
      .where(eq(linkTable.ownerId, ctx.actor.id))
      .returning();

    return { count: rows.length };
  },
});
```

The router calls the action. Import `z` from `zod` and `markAllReadAction` from `../actions/mark-all-read.action` at the top of the file:

```ts
// server/domains/link/routers/link.router.ts, in linkRouter
  markAllRead: authedProcedure
    .output(z.object({ count: z.number() }))
    .mutation(({ ctx }) => markAllReadAction({}, { actor: ctx.actor })),
```

Replace the generated test with one that checks the rows:

```ts
// server/domains/link/actions/mark-all-read.action.test.ts
import { expect, expectRow, runAction } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { userFactory, linkFactory } from "#nuxvel/factories";
import { linkTable } from "#nuxvel/schema";

describe("link/mark-all-read action", () => {
  it("marks only the links of the actor as read", async () => {
    const ada = await userFactory();
    await linkFactory({ ownerId: ada.id });
    const other = await linkFactory();

    await expect(runAction("link.mark-all-read", {}, { actingAs: ada })).resolves.toEqual({ count: 1 });
    await expectRow(linkTable, { id: other.id, read: false });
  });
});
```

```bash
./nv test:arch
```

```
✔ All architecture rules pass
```

The rule `nuxvel/module-imports` also checks the modules. A module imports another module only from its `shared/` folder. This app has one module, so the rule has nothing to report. See [Modules: boundaries](../modules.md#boundaries). [CLI: `nuxvel test:arch`](../cli.md#nuxvel-testarch) lists every rule. The `architecture` preset of `@nuxvel/nuxt/eslint` shows the same rules in your editor.

## 4. Tests and the build

Run the five checks of the app before you ship:

```bash
npm run typecheck
./nv test
npm run test:ui
npm run test:e2e
./nv test:arch
```

```
 Test Files  6 passed (6)
      Tests  9 passed (9)
```

`./nv test` runs the functional tests in `tests/`, `server/` and `layers/`. `npm run test:ui` runs the stories of the components, and `npm run test:e2e` runs the browser tests in `tests/e2e/`. See [Testing](../testing.md) for the three layers.

Add one more functional test, for the maintenance mode of chapter 12:

```ts
// tests/functional/maintenance.test.ts
import { describe, it } from "vitest";
import { expect, guest, startMaintenance } from "@nuxvel/nuxt/testing";

describe("maintenance mode", () => {
  it("answers 503 with a retry time, and keeps the health check ready", async () => {
    await startMaintenance({ message: "Back at 10:00", retryAfter: 300 });

    const response = await guest().fetch("/reports");

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
    const health = await guest().$fetch("/api/health/ready");
    expect(health).toMatchObject({ status: "ready", maintenance: true });
  });
});
```

### The Docker image

`nuxvel build` builds the app in Linux containers with Docker Buildx, from the `Dockerfile` of the app. Give the app a version first. The image tag and the archive name use it:

```bash
npm pkg set version=1.0.0
npm install
./nv build --image=shelf:1.0.0
```

```
◇  Built shelf:1.0.0 for linux/arm64 (54.3s)
│
└  Loaded shelf:1.0.0 into Docker
```

The platform is the platform of your machine. Add `--platform=linux/amd64` for a server with another CPU. The image runs the server as the `node` user on port 3000, and has a health check on `/api/health/live`.

Run the migrations from the image, then start it. The image reads every setting from the environment:

```bash
docker run --rm --env NUXT_DATABASE_OWNER_URL=postgres://nuxvel:nuxvel@host.docker.internal:5432/nuxvel shelf:1.0.0 node .output/server/nuxvel/migrate.mjs
```

```
nuxvel migrate: applied 0000_init
...
nuxvel migrate: applied 0017_links
...
nuxvel migrate: the database is up to date
```

```bash
docker run -d --name shelf-web -p 127.0.0.1:3000:3000 \
  --env NUXT_DATABASE_URL=postgres://nuxvel:nuxvel@host.docker.internal:5432/nuxvel \
  --env NUXT_REDIS_URL=redis://host.docker.internal:6379 \
  --env NUXT_MAIL_URL=smtp://host.docker.internal:1025 \
  --env NUXT_AUTH_SECRET=$(openssl rand -hex 32) \
  --env NUXT_AUDIT_CHAIN_SECRET=$(openssl rand -hex 32) \
  --env NUXT_SITE_URL=http://localhost:3000 \
  shelf:1.0.0
curl https://shelf.example.com/api/health/ready
```

```json
{"status":"ready","database":"reachable","redis":"reachable","disk":"ok"}
```

A production server stops at boot when a required variable is missing, such as `NUXT_SITE_URL` or `NUXT_AUDIT_CHAIN_SECRET`. The same image runs the queue worker with `--env NUXVEL_ROLE=worker`. Each line of the logs is one JSON object:

```bash
docker logs shelf-web
```

```
{"time":"2026-10-02T22:28:42.744Z","level":"info","tag":"request","msg":"GET /api/health/live 200 (2ms)","method":"GET","path":"/api/health/live","status":200,"durationMs":2.4324180000003253,"requestId":"tut-1"}
```

Stop the container:

```bash
docker rm -f shelf-web
```

### The release archive

A VPS runs the app from an archive, not from an image:

```bash
./nv build --artifact
```

```
◇  Built linux/arm64 (40.7s)
│
└  1 archive in dist/

✔ Built dist/shelf-1.0.0-linux-arm64.tar.gz
```

The archive holds the built server, the migrations and the [build manifest](../build.md#build-manifest), with the commit, the Node version and the platform of the build. A `.sha256` file is next to it. `nuxvel deploy` checks both before it uploads the archive.

## 5. Continuous deployment

`nuxvel make:ci` writes a GitHub Actions workflow that tests, checks, builds and deploys each push to `main`. It reads the environment from `nuxvel.deploy.ts`, so write that file first. Chapter 6 explains it:

```ts
// nuxvel.deploy.ts
import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({
  app: "shelf",
  environments: {
    production: {
      servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] }],
      arch: "arm64",
      domains: ["shelf.example.com"],
    },
  },
});
```

```bash
./nv make:ci production
```

```
✔ Created .github/workflows/deploy.yml
```

The workflow has four jobs:

| Job | Does |
|---|---|
| `test` | Runs `nuxvel test` in 3 shards. |
| `check` | Runs `nuxvel db:check` and `nuxvel routes --diff-env=production`. When a migration changed since the live release, it runs `nuxvel test:compat` against the commit of that release. |
| `build` | Builds the archive with `nuxvel build --artifact --platform=linux/arm64`, on an `ubuntu-24.04-arm` runner. |
| `deploy` | After the three other jobs, runs `nuxvel deploy production --artifact=...` in the GitHub environment `production`. |

`nuxvel db:check` is the check that the deploy needs most. Run it now:

```bash
./nv db:check
```

```
✔ Every foreign key has an index
✔ Every migration is in order
✔ Every migration is safe to deploy
```

The workflow connects to the server as the deploy user, with the private key in the repository secret `NUXVEL_SSH_KEY`. Chapter 6 makes that key. The workflow does not run `npm run typecheck` or `nuxvel test:arch`. Add them to the `check` job:

```yaml
      - run: npm run typecheck
      - run: npx nuxvel test:arch
```

This tutorial cannot run the workflow on GitHub. Chapters 7 and 8 run the same `nuxvel deploy` command from your machine.

## 6. Set up the server

The rest of the tutorial runs the app on a VPS. The chapters use the made-up address `203.0.113.10` and the domain `shelf.example.com`. Use your own server and domain. nuxvel connects to the server with your `ssh`, so a `Host` entry in `~/.ssh/config` applies.

### The deploy file

`nuxvel.deploy.ts` describes each environment. Give the production environment a shorter hold, an alert webhook and an off-site bucket for the backups:

```ts
// nuxvel.deploy.ts
import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({
  app: "shelf",
  environments: {
    production: {
      servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] }],
      arch: "arm64",
      domains: ["shelf.example.com"],
      processes: { web: 2, worker: 1 },
      deploy: { hold: 120 },
      alerts: { webhook: process.env.NUXVEL_ALERTS_WEBHOOK },
      backups: {
        offsite: {
          endpoint: process.env.NUXVEL_OFFSITE_ENDPOINT,
          bucket: "shelf-backups",
          accessKeyId: process.env.NUXVEL_OFFSITE_ACCESS_KEY_ID,
          secretAccessKey: process.env.NUXVEL_OFFSITE_SECRET_ACCESS_KEY,
        },
      },
    },
  },
});
```

| Option | Value |
|---|---|
| `servers` | One server, with the user that deploys the app. The setup creates the user. Do not use `root`. |
| `arch` | The CPU of the server, `arm64` or `amd64`. The archive must be for the same CPU. |
| `domains` | The domains that serve the app. Caddy gets a TLS certificate for each one. |
| `processes` | The number of web processes and workers of each color. Without it, the deploy sizes them from the memory of the server. |
| `deploy.hold` | The seconds that the old release stays ready after a deploy, so the deploy can switch back. The default is 600. |
| `alerts.webhook` | The URL that the monitor of the server sends its alerts to, as a JSON `POST`. |
| `backups.offsite` | An S3-compatible bucket at another provider. Each backup goes there too, so a lost server does not lose its backups. |

Never write a credential in `nuxvel.deploy.ts`. The file reads them from `process.env`, and the CLI loads `.env.deploy` first. Git ignores that file:

```bash
# .env.deploy
NUXVEL_ALERTS_WEBHOOK=https://hooks.example.com/shelf-alerts
NUXVEL_OFFSITE_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
NUXVEL_OFFSITE_ACCESS_KEY_ID=...
NUXVEL_OFFSITE_SECRET_ACCESS_KEY=...
```

Commit a `.env.deploy.example` with the same names and no values. When a variable is not set, each command stops with `is not set, add it to .env.deploy`.

### The setup

The setup connects as `root`. It turns off password login, so add your SSH key to root first, for example in the panel of your provider. Then look at the changes before you make them:

```bash
./nv server:setup production --dry-run
```

```
Memory budget of 15872 MB: Postgres 3968 MB, Redis 1587 MB, SeaweedFS and Caddy 793 MB, app processes 9524 MB
~ create /srv/nuxvel
...
SSH host key of 203.0.113.10: ssh-ed25519 SHA256:Oh+SDDTHi4qSyCwEOT8xDVqgnOMSNEwZzZ4uRsJqa/4
  → Pinned in .nuxvel/known_hosts: commit it, the CLI and CI refuse another key
...
✔ Dry run: 56 changes to make on root@203.0.113.10, nothing changed
```

The first connection pins the SSH host key of the server in `.nuxvel/known_hosts`. Compare the fingerprint with the one that your provider shows, and commit the file. Every later command, also in CI, refuses a server with another key. Now set up the server:

```bash
./nv server:setup production
```

```
Memory budget of 15872 MB: Postgres 3968 MB, Redis 1587 MB, SeaweedFS and Caddy 793 MB, app processes 9524 MB
~ create /srv/nuxvel
~ set the time zone to UTC
~ create a 2 GB swap file
~ create the user deploy
~ add root's SSH keys to deploy
~ allow SSH with keys only, and root with a key only
~ install fail2ban
~ allow port 22 in the firewall
~ allow port 80 in the firewall
~ allow port 443 in the firewall
~ turn on the firewall
~ install security updates every day
~ install Node.js 24
~ install pm2
~ install Caddy 2.11.4
~ install Postgres 18
~ run Redis durable on localhost:6379
~ run Redis cache on localhost:6380
~ run SeaweedFS with S3 on localhost:8333
~ make the recovery key
~ back up every app each night with the timer nuxvel-backup
~ watch the server and its apps every minute with the timer nuxvel-monitor
~ send the alerts to the webhook
~ upload the backups to the off-site bucket shelf-backups
~ write the server registry /srv/nuxvel/server.json
...
▲ Recovery key, shown this one time. It decrypts the config backups of this server, which keeps only its public key:

  AGE-SECRET-KEY-1J7FQ02A2EZDF6D327S2VH9ZMEZ6VJMGN9PU0CLQG94G3RSK0R6XSLKLFAK

◆  Recovery key and off-site credentials stored outside the server?
│  ○ Yes / ● No
```

The list above is shorter than the real one, which has 57 changes. The setup takes about 10 minutes. It installs Postgres, SeaweedFS for the files, and Caddy in front of the app. It installs two Redis instances: `durable` for the queue and the app data, `cache` for cached values. It installs Node.js at the version of `.nvmrc`, and pm2 to run the app processes. Postgres, Redis and SeaweedFS listen only on localhost. The firewall lets in only SSH, HTTP and HTTPS.

The recovery key decrypts the config backups. The server keeps only its public key, so store the private key in a password manager, with the credentials of the off-site bucket. You need both to restore a lost server. The setup asks until you answer yes, so run it in a terminal. It ends with the URL to add to an external uptime service:

```
Add these URLs to an external uptime service, such as UptimeRobot or Better Stack:
  https://shelf.example.com/api/health/ready
```

The setup checks the server before each change. A second run changes nothing:

```bash
./nv server:setup production
```

```
✔ root@203.0.113.10 is set up, nothing to change
```

Point the DNS record of `shelf.example.com` at the server. Caddy then gets a TLS certificate for it on the first request. The DNS record and the certificate need a real server and domain, so this tutorial does not show their output.

### A key for CI

The workflow of chapter 5 connects as the deploy user, never as root. Make a key for it, and add the public key to the deploy user:

```bash
ssh-keygen -t ed25519 -N "" -C ci -f nuxvel-ci
ssh deploy@203.0.113.10 'cat >> ~/.ssh/authorized_keys' < nuxvel-ci.pub
```

Add the private key, `nuxvel-ci`, as the repository secret `NUXVEL_SSH_KEY`, then delete it from your machine. A later `server:setup` keeps this key. The workflow has no `.env.deploy`: add `NUXVEL_ALERTS_WEBHOOK` and the three `NUXVEL_OFFSITE_*` variables as repository secrets, and set them in the `env` of the `check` and `deploy` jobs.

## 7. The first deploy

The app needs settings that only you know, such as the SMTP server of its mail. A production server refuses to start without `NUXT_MAIL_URL`. So create the app on the server first, and add the settings before you deploy:

```bash
./nv app:create production
```

```
~ create /srv/apps
~ create /srv/apps/shelf
Ports of shelf on localhost: blue 3000-3009, green 3010-3019
~ record shelf in the server registry /srv/nuxvel/server.json
~ create /srv/apps/shelf/releases
~ create /srv/apps/shelf/shared, which only deploy may read
~ create /srv/nuxvel/assets/shelf/_nuxt, which only root may write and Caddy may read
~ write /srv/apps/shelf/state.json with no release yet
~ create the database role shelf_owner, its URL in /srv/apps/shelf/shared/owner.env
~ create the database role shelf_app, its URL in /srv/apps/shelf/shared/.env
~ create the database shelf, owned by shelf_owner, with data rights for shelf_app
~ run .output/server/nuxvel/maintenance.mjs of shelf every day with the timer nuxvel-shelf-maintenance
~ create the Redis user shelf on durable for the keys shelf:*, its URL in /srv/apps/shelf/shared/.env
~ create the Redis user shelf on cache for the keys shelf:*, its URL in /srv/apps/shelf/shared/.env
~ set NUXT_REDIS_PREFIX=shelf: in /srv/apps/shelf/shared/.env
~ create the bucket shelf-private
~ create the bucket shelf-public
~ create the S3 user shelf for shelf-private and shelf-public, its URL in /srv/apps/shelf/shared/.env
~ set NUXT_STORAGE_BUCKET=shelf-private in /srv/apps/shelf/shared/.env
~ let anyone read the files of shelf-public
~ allow uploads and downloads from shelf.example.com in shelf-private
~ allow uploads and downloads from shelf.example.com in shelf-public
~ delete the files under tmp/ of shelf-private after one day
~ set a random NUXT_AUTH_SECRET in /srv/apps/shelf/shared/.env
~ set a random NUXT_AUDIT_CHAIN_SECRET in /srv/apps/shelf/shared/.env
~ set NUXT_SITE_URL=https://shelf.example.com in /srv/apps/shelf/shared/.env
✔ Made 25 changes on root@203.0.113.10
```

```bash
./nv env:pull production
```

`app:create` makes the folder of the app, a database with an owner role and a runtime role, a Redis user on each instance and two buckets. It sets a random `NUXT_AUTH_SECRET` and `NUXT_AUDIT_CHAIN_SECRET`, and `NUXT_SITE_URL`. It writes the connections to `/srv/apps/shelf/shared/.env` on the server. `env:pull` copies that file to `.nuxvel/production.env`, which git ignores:

```
✔ Wrote shared/.env of shelf on 203.0.113.10 to .nuxvel/production.env
```

Add the mail settings to `.nuxvel/production.env`:

```bash
NUXT_MAIL_URL=smtp://user:secret@smtp.example.com:587
NUXT_NUXVEL_MAIL_FROM=Shelf <hello@shelf.example.com>
```

Upload the file:

```bash
./nv env:push production
```

```
~ set NUXT_MAIL_URL
~ set NUXT_NUXVEL_MAIL_FROM
✔ Uploaded .nuxvel/production.env as shared/.env of shelf on 203.0.113.10
```

Then deploy the archive of chapter 4:

```bash
./nv deploy production --artifact=dist/shelf-1.0.0-linux-arm64.tar.gz
```

```
~ extract the release 20261002T225816Z-ac383b6 into /srv/apps/shelf/releases/20261002T225816Z-ac383b6, with shared/.env
~ copy its hashed assets into /srv/nuxvel/assets/shelf/_nuxt
nuxvel migrate: applied 0000_init
...
nuxvel migrate: applied 0017_links
nuxvel migrate: deferred the contract migration 0013_audit-row-macs
nuxvel migrate: deferred the contract migration 0014_push-subscription-sessions
nuxvel migrate: the database is up to date
▲ Deferred the contract migration 0013_audit-row-macs: it runs once no older release runs
▲ Deferred the contract migration 0014_push-subscription-sessions: it runs once no older release runs
~ start shelf-web-blue on 127.0.0.1:3000
  / answers 200
~ start shelf-worker-blue
Caddy serves shelf from blue on 127.0.0.1:3000
~ switch shelf to blue: 20261002T225816Z-ac383b6 is live
...
✔ Deployed the release 20261002T225816Z-ac383b6 of shelf to 203.0.113.10, live on blue
▲ Contract migrations are deferred
  → Run nuxvel db:contract production to apply them, now that no older release runs
```

Without `--artifact`, the deploy builds the archive itself, from a clean git tree whose commit is pushed. The release name is the deploy time and the commit. The deploy runs the migrations as the owner role, starts the web processes of the blue color, and requests `/` on them. Only then does Caddy send traffic to blue.

The two deferred migrations come with the starter. A deploy defers a [contract migration](../database.md#contract-migrations) until no older release runs. On the first deploy, nothing else runs, so apply them now:

```bash
./nv db:contract production
```

```
~ apply the contract migration 0013_audit-row-macs
~ apply the contract migration 0014_push-subscription-sessions
✔ Applied 2 contract migrations of shelf on 203.0.113.10
```

`nuxvel status` shows the live release and its processes:

```bash
./nv status production
```

```
shelf on 203.0.113.10
Release  20261002T225816Z-ac383b6 (blue)
Health   ready (200)
Backup   none yet
Off-site none
```

## 8. An expand and a contract migration

A deploy runs the migrations while the old release still serves, and it can switch back to the old release during the hold. So each migration must work with the old release and the new one. A change that removes a column takes two steps:

1. The expand step adds what the new release needs. The deploy runs it before the switch.
2. The contract step removes what only the old release used. It runs once no old release runs.

The change: a link records when it was read, not only whether it was read. The `read` column becomes `read_at`.

### The new release

In the table, replace the `read` column with a `readAt` column that can be empty. Import `timestamp` in place of `boolean`:

```ts
// server/domains/link/schema/link.schema.ts, in linkTable
  readAt: timestamp("read_at"),
```

In `shared/schemas/link.ts`, replace `read` in `linkSchema`:

```ts
// shared/schemas/link.ts, in linkSchema
  readAt: z.date().nullable(),
```

Remove `read` from `createLinkInput` and from the `filters` of `linkListColumns`. In the `sort` list of `linkListColumns`, replace `"read"` with `"readAt"`. The action sets the time:

```ts
// server/domains/link/actions/mark-all-read.action.ts
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { linkTable } from "#nuxvel/schema";

export const markAllReadAction = defineAction({
  input: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await useDb()
      .update(linkTable)
      .set({ readAt: now() })
      .where(and(eq(linkTable.ownerId, ctx.actor.id), isNull(linkTable.readAt)))
      .returning();

    return { count: rows.length };
  },
});
```

The report counts the links with a time:

```ts
// layers/reports/server/domains/report/routers/report.router.ts, in summary
          read: sql`count(${linkTable.readAt})`.mapWith(Number),
```

In the tests, replace `read: true` with `readAt: new Date()` and `read: false` with `readAt: null`.

### The migrations

```bash
./nv db:generate --name link-read-at
```

Drizzle asks if `read_at` is a new column or the `read` column renamed. Select `create column`: a rename breaks the old release, which still reads `read`. The command then moves the drop to a contract migration:

```
[✓] Your SQL migration file ➜ server/database/migrations/0018_link-read-at.sql 🚀
▲ Moved 1 breaking statement to contract/0018_link-read-at.sql
  → A deploy runs it once no older release runs. A rename or a type change breaks the new release until then: add a column and backfill it instead
    ALTER TABLE "link" DROP COLUMN "read"
```

The expand migration adds the column:

```sql
-- server/database/migrations/0018_link-read-at.sql
ALTER TABLE "link" ADD COLUMN "read_at" timestamp;
```

The read links must keep their state. Copy `read` into `read_at` before the drop. The copy goes into the contract migration too. A link that the old release marks as read after the expand step then also gets its time:

```sql
-- server/database/migrations/contract/0018_link-read-at.sql
UPDATE "link" SET "read_at" = "updated_at" WHERE "read" AND "read_at" IS NULL;--> statement-breakpoint
ALTER TABLE "link" DROP COLUMN "read";
```

`nuxvel db:check` refuses the copy in the expand migration, because it changes rows that the old release still uses:

```
✖ Breaking statement in an expand migration: UPDATE "link" SET "read_at" = "updated_at" WHERE "read"
  → Move it to contract/0018_link-read-at.sql, which a deploy runs once no older release runs
✖ 1 unsafe migration statement
```

With the copy in the contract migration, it passes:

```bash
./nv db:check
```

```
✔ Every migration is safe to deploy
```

Until the contract step, a link that the old release marked as read shows as unread in the new release. For a large table, or when that gap matters, copy the rows with a [backfill](../backfills.md) and name it in the contract migration with `-- nuxvel:requires-backfill=<name>`.

### The blue-green deploy

Commit the change, set the version to `1.1.0`, and build the archive again. Then deploy it:

```bash
npm pkg set version=1.1.0
npm install
./nv build --artifact
./nv deploy production --artifact=dist/shelf-1.1.0-linux-arm64.tar.gz
```

```
~ extract the release 20261002T230014Z-ef316e7 into /srv/apps/shelf/releases/20261002T230014Z-ef316e7, with shared/.env
~ copy its hashed assets into /srv/nuxvel/assets/shelf/_nuxt
nuxvel migrate: applied 0018_link-read-at
nuxvel migrate: deferred the contract migration 0018_link-read-at
nuxvel migrate: the database is up to date
▲ Deferred the contract migration 0018_link-read-at: it runs once no older release runs
~ start shelf-web-green on 127.0.0.1:3010
  / answers 200
~ start shelf-worker-green
~ stop shelf-worker-blue once its jobs finish
Caddy serves shelf from green on 127.0.0.1:3010
~ switch shelf to green: 20261002T230014Z-ef316e7 is live
Holding blue for 120s while green serves
~ close the realtime streams of shelf-web-blue, so its clients reconnect to green
~ retire the blue processes of shelf
Kept 3 of 3 releases
✔ Deployed the release 20261002T230014Z-ef316e7 of shelf to 203.0.113.10, live on green
▲ Contract migrations are deferred
  → Run nuxvel db:contract production to apply them, now that no older release runs
```

The deploy runs the expand migration while blue serves. It starts the new release on the idle color, green, and switches Caddy to green only when green is ready and `/` answers. Then it holds blue for 120 seconds, idle but ready. During the hold, the deploy watches green. It switches back to blue and sends an alert when `/api/health/ready` fails 3 times in a row, or when 10% of the requests answer 5xx. After a clean hold, it retires blue.

Until the contract step, you can go back to the old release. `nuxvel rollback` deploys a release on the server to the idle color, with the same checks and hold, and runs no migration. Without a release name, it takes the release before the live one:

```bash
./nv rollback production 20261002T225816Z-ac383b6
```

```
✔ Deployed the release 20261002T225816Z-ac383b6 of shelf to 203.0.113.10, live on blue
▲ 0 jobs are in the failed lists of shelf. Jobs that the rolled-back release queued with a new job name or payload version fail on the old workers and land there too
  → Run nuxvel queue:retry after the next deploy
```

The rollback works because the `read` column is still there. Deploy release `1.1.0` again with the same command as above. It is live on green after the hold.

### The contract step

Once release `1.1.0` runs on its own, apply the contract migration:

```bash
./nv db:contract production
```

```
~ apply the contract migration 0018_link-read-at
✔ Applied 1 contract migration of shelf on 203.0.113.10
```

`db:contract` takes the deploy lock, and refuses while the other color still runs an older release. From now on, a rollback to release `1.0.0` would read a column that is gone, so `nuxvel rollback` refuses it:

```bash
./nv rollback production 20261002T225816Z-ac383b6
```

```
✖ 20261002T225816Z-ac383b6 is older than the applied contract migrations 0018_link-read-at
  → It may read what they removed. Roll back to a newer release, or run it anyway with --force
```

`nuxvel releases` lists the releases on the server:

```bash
./nv releases production
```

```
RELEASE                   COMMIT   SOURCE  DEPLOYED                 COLOR
20261002T230451Z-ef316e7  ef316e7  local   2026-10-02 23:04:51 UTC  green (live)
20261002T230014Z-ef316e7  ef316e7  local   2026-10-02 23:00:14 UTC  -
20261002T225816Z-ac383b6  ac383b6  local   2026-10-02 22:58:16 UTC  blue
```

In CI, the `check` job of chapter 5 runs `nuxvel test:compat` when a migration changed. It runs the tests of the live release against the new migrations, without the contract migrations. A migration that breaks the live release fails the job before the deploy.

## 9. A REPL on the server

`nuxvel tinker production` opens the [tinker REPL](../cli.md#nuxvel-tinker) in the live release on the server, as the deploy user. It has the environment of the app processes. The tables, the actions and every server helper are in scope. What you run there changes the live data, so the command asks first:

```bash
./nv tinker production
```

```
◆  Open a REPL on shelf in production (203.0.113.10)? What you run there changes its live data
│  ○ Yes / ● No
```

Answer yes. Give the app a user and two links. An action takes an actor, so pass the user as the actor:

```
nuxvel> const ada = await useDb().insert(userTable).values({ id: "u_ada", name: "Ada", email: "ada@example.com", emailVerified: true }).returning().then(firstOrFail)
nuxvel> const actor = { type: "user", id: ada.id, role: "user" }
nuxvel> await createLinkAction({ url: "https://nuxt.com/docs", title: "Nuxt docs" }, { actor })
nuxvel> await createLinkAction({ url: "https://orm.drizzle.team", title: "Drizzle" }, { actor })
nuxvel> await markAllReadAction({}, { actor })
{ count: 2 }
nuxvel> await useDb().select({ title: linkTable.title, readAt: linkTable.readAt }).from(linkTable)
[
  { title: 'Nuxt docs', readAt: 2026-10-02T23:18:31.850Z },
  { title: 'Drizzle', readAt: 2026-10-02T23:18:31.850Z }
]
```

The transcript leaves out the rows and the log lines that the actions print. The REPL is JavaScript, not TypeScript. `trpc` is in scope too, but it has no session, so a procedure behind `authedProcedure` throws `Not signed in` there. Call the action with an actor instead. Each action writes its `action` log line, with the actor, as it does in a request.

Piped input works too, one statement at a time. Without a terminal, the command needs `--force`, because it cannot ask:

```bash
echo 'await useDb().$count(linkTable)' | ./nv tinker production --force
```

```
nuxvel> await useDb().$count(linkTable)
2
```

`nuxvel ssh production` opens a shell as the deploy user in `/srv/apps/shelf/`, for the rare case that the REPL cannot do.

## 10. Backups and restores

Each night between 02:00 and 03:00 UTC, the server backs up every app on it. `nuxvel db:backup` makes a backup now:

```bash
./nv db:backup production
```

```
~ dump the database shelf to /srv/nuxvel/backups/shelf/database-20261002T231851Z.dump (0.1 MB)
~ sync the bucket shelf-private to /srv/nuxvel/backups/shelf/buckets/shelf-private: 0 files, 0 copied, 0 removed
~ sync the bucket shelf-public to /srv/nuxvel/backups/shelf/buckets/shelf-public: 0 files, 0 copied, 0 removed
~ write the config bundle /srv/nuxvel/backups/shelf/config-20261002T231851Z.tar.age, encrypted to the recovery key
~ remove the backup of 20261002T231839Z, past the retention of 7 daily, 4 weekly and 12 monthly
~ upload the backup to offsite:shelf-backups/shelf, with the database dump encrypted to the recovery key
✔ Backed up shelf on 203.0.113.10 to /srv/nuxvel/backups/shelf/, as of 20261002T231851Z
```

A backup is a dump of the database, a copy of the files of both buckets, and the config bundle. The config bundle holds `shared/.env`, the live release and the server registry, encrypted to the recovery key. The server keeps the newest backup of each of the last 7 days, 4 weeks and 12 months. This backup replaced an earlier backup of the same day. Each backup also goes to the off-site bucket. `nuxvel status` shows the last one:

```
Backup   2026-10-02T23:18:52.807Z
Off-site uploaded 2026-10-02T23:18:53.124Z
```

### The erasure log

A backup taken before a user asked to be erased still holds their rows. A restore must not bring them back. So the server records each erasure outside the database. Erase Ada in the REPL:

```
nuxvel> await eraseUserData("u_ada")
{
  api_keys: 0,
  flag_conversions: 0,
  flag_exposures: 0,
  link: 2,
  notifications: 0,
  push_subscriptions: 0,
  user: 1
}
```

The erasure deleted her 2 links, because chapter 3 declared the `link` table in `server/privacy/`. Before it deleted a row, it appended her ID to the erasure log of the server, `/srv/nuxvel/erasures/shelf.jsonl`, and uploaded the record to the off-site bucket. When that upload fails, the erasure fails too, and deletes nothing.

### Restoring a backup

`nuxvel db:restore` restores the newest backup into a new database, next to the live one, and checks it:

```bash
./nv db:restore production
```

```
~ restore /srv/nuxvel/backups/shelf/database-20261002T231851Z.dump into the new database shelf_restored_20261002t231851z
  19 migrations applied, 19 at the backup
  ...
  public.user: 1 rows, 1 at the backup
  ...
  public.link: 2 rows, 2 at the backup
  ...
~ erase again 1 user erased after the backup, in the new database shelf_restored_20261002t231851z
✔ Restored the backup 20261002T231851Z of shelf into the new database shelf_restored_20261002t231851z on 203.0.113.10, the live database is untouched
```

The restore compares the number of migrations and the rows of each table with the counts that the backup recorded. Then it reads the erasure log, and erases Ada again in the new database, because she was erased after the backup. The new database thus has no user and no link. To use it, point `NUXT_DATABASE_URL` at it with `env:pull` and `env:push`. `--from=<time>` restores an earlier backup.

### Checking the recovery key

Check now that the key in your password manager opens the backups. Do not wait until the server is lost:

```bash
./nv dr:check production
```

```
◆  Recovery key (AGE-SECRET-KEY-1...), shown by the first server:setup
✔ The recovery key decrypts the local config bundle 20261002T231851Z of shelf
✔ The recovery key decrypts the off-site config bundle 20261002T231851Z of shelf
```

The command also reads the key from `NUXVEL_RECOVERY_KEY`, so CI can run it.

### Rehearsing a restore

When the server is lost, `nuxvel server:restore production` rebuilds it from the off-site bucket on a new server at the same address. Rehearse that before you need it. A rehearsal restores the backup of production on another server, next to the app there, and removes it after. Add a staging environment with its own server and its own off-site bucket:

```ts
// nuxvel.deploy.ts, in environments
    staging: {
      servers: [{ host: "203.0.113.20", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] }],
      arch: "arm64",
      domains: ["staging.shelf.example.com"],
      backups: {
        offsite: {
          endpoint: process.env.NUXVEL_OFFSITE_ENDPOINT,
          bucket: "shelf-staging-backups",
          accessKeyId: process.env.NUXVEL_OFFSITE_ACCESS_KEY_ID,
          secretAccessKey: process.env.NUXVEL_OFFSITE_SECRET_ACCESS_KEY,
        },
      },
    },
```

Each environment must have its own server and its own bucket: `nuxvel.deploy.ts` refuses two environments with the same `host`, or with the same bucket. Set up the staging server as in chapter 6, then rehearse:

```bash
./nv server:setup staging
./nv server:restore staging --from=production:latest
```

```
◆  Recovery key (AGE-SECRET-KEY-1...), shown by the first server:setup
~ download and decrypt the config bundle 20261002T231851Z of shelf (0.1s)
Rehearsing the restore of shelf from its backup 20261002T231851Z of production, as shelf-rehearsal next to shelf
~ create /srv/apps/shelf-rehearsal
...
~ restore the database shelf_rehearsal from the backup 20261002T231851Z of shelf (0.2s)
~ restore the files of the bucket shelf-private into shelf-rehearsal-private (0.0s)
~ restore the files of the bucket shelf-public into shelf-rehearsal-public (0.0s)
~ extract the release 20261002T231332Z-ef316e7 of shelf (0.4s)
~ write /srv/apps/shelf-rehearsal/shared/.env: the settings of shelf with the connections of shelf-rehearsal, and outgoing mail to a closed port
~ erase again 1 user erased after the backup (1.1s)
~ start shelf-rehearsal on 127.0.0.1:3000 without workers, so no job, mail, webhook or schedule runs, and wait until it is ready (1.0s)
~ drop the database shelf_rehearsal
...
✔ Rehearsed the restore of shelf from production on 203.0.113.20 in 0.1 min, and removed shelf-rehearsal
Recorded in .nuxvel/rehearsals.json: commit it, nuxvel doctor warns when the last rehearsal of production is older than 90 days
```

The rehearsal asks for the recovery key of production. It restores the database, the files and the live release into a temporary app, `shelf-rehearsal`. It erases again the users of the erasure log. Then it starts the web process with no worker and no outgoing mail. At the end, it removes the temporary app. Each step shows its time, so you know how long a real restore takes. The rehearsal puts a copy of the production data on the staging server while it runs, so protect that server as well as production.

## 11. Monitoring and error tracking

### The monitor

`server:setup` installed a monitor that runs every minute, apart from the app. It checks the disk, the memory, the services, `/api/health/ready` of the live color, the age of the backups, the queues, the TLS certificates and more. See [Deploying to a VPS: monitoring](../deploy.md#monitoring) for every check. It sends each alert to the channels of `alerts`. Check the webhook:

```bash
./nv alerts:test production
```

```
✔ Sent the test alert through the webhook
```

The webhook gets a JSON `POST`:

```json
{"server":"203.0.113.10","event":"test","key":"test","severity":"info","message":"A test alert from nuxvel alerts:test","time":"2026-10-02T23:08:57.813Z"}
```

When the web processes of the live color stop answering for 2 minutes, the monitor sends a critical alert. To see one, stop them, and start them again after the alert:

```bash
ssh deploy@203.0.113.10 'pm2 stop shelf-web-green'
ssh deploy@203.0.113.10 'pm2 start shelf-web-green'
```

The monitor sends the alert, and one more message when the processes answer again:

```json
{"server":"203.0.113.10","event":"firing","key":"health:shelf","severity":"critical","message":"shelf: /api/health/ready on green fails","time":"2026-10-02T23:12:04.251Z","repeat":false}
{"server":"203.0.113.10","event":"resolved","key":"health:shelf","severity":"critical","message":"Resolved: shelf: /api/health/ready on green fails","time":"2026-10-02T23:13:04.491Z"}
```

`nuxvel status production` showed `Health   not answering` during that time. The monitor runs on the server, so it cannot tell you that the whole server is down. The external uptime service of chapter 6 does that, or a `heartbeat` URL in `alerts`.

`nuxvel server:status` shows the whole server:

```bash
./nv server:status production
```

```
203.0.113.10
Disk     63880 of 294400 MB (22%)
Memory   15872 MB, 9524 MB for apps, swap in use 0 MB
Services postgres up, redis durable up, redis cache up, seaweedfs up, caddy up, pm2 up

APP    RELEASE                          PROCESSES  MEMORY           BACKUP
shelf  20261002T231332Z-ef316e7 (blue)  3          1536 of 9524 MB  2026-10-02T23:18:52.807Z

No query averages 500 ms or more
```

### Logs

`nuxvel logs production` streams the logs of the live web processes until you press Ctrl-C. `--worker` streams the workers, and `--caddy` the access log of Caddy:

```bash
./nv logs production --lines=3
```

```
...
{"time":"2026-10-02T23:13:04.550Z","level":"info","tag":"request","msg":"GET /api/health/ready 200 (14ms)","method":"GET","path":"/api/health/ready","status":200,"durationMs":13.582618000000366,"requestId":"c1b7d51f-909f-4a19-a3b3-00fed0945c21"}
```

Each request line has a request ID. The action lines, the audit rows and the reported errors of that request have the same ID. See [Observability](../observability.md#request-ids).

### Error tracking

nuxvel sends the unexpected errors of the server and the browser to a Sentry-compatible tracker, such as [Bugsink](https://www.bugsink.com), Sentry or GlitchTip. Expected errors, such as a validation error or `NotFoundError`, do not go there. Create a project in the tracker, and add its DSN to the server environment:

```bash
./nv env:pull production
```

```bash
# .nuxvel/production.env
NUXT_PUBLIC_SENTRY_DSN=https://<key>@errors.example.com/1
```

```bash
./nv env:push production
./nv deploy production --artifact=dist/shelf-1.1.0-linux-arm64.tar.gz
```

```
~ set NUXT_PUBLIC_SENTRY_DSN
✔ Uploaded .nuxvel/production.env as shared/.env of shelf on 203.0.113.10
```

A process reads `shared/.env` only when it starts, so the deploy starts every process with the DSN. The DSN is runtime config, so the archive does not change. nuxvel also adds the origin of the DSN to the `connect-src` of the Content Security Policy, so the browser can send its events. Each event has the `requestId` tag, which leads to its log lines. nuxvel removes the headers, the cookies, the query string and the body of the request before it sends an event. See [Observability: error tracking](../observability.md#error-tracking).

## 12. Maintenance mode

Some work must not run beside live traffic, such as a long change to a large table. Maintenance mode takes the app offline for its users: every request gets a `503` with a maintenance page or a JSON error, and the queue pauses.

`nuxvel down` writes the state to the Redis of the app. Every web process and every worker that shares that Redis goes down at the same time. On the server, Redis listens only on localhost, so `nuxvel down production` connects over SSH and runs in the live release, as `tinker production` does in chapter 9. Both colors use the same Redis, so blue and green go down together. The command asks first:

```bash
./nv down production --message "Moving the links to a new server. Back at 10:00." --retry 300 --secret shelf-ops-2026
```

```
◆  Put shelf in production (203.0.113.10) in maintenance mode? Its users get a 503 until nuxvel up production
│  ○ Yes / ● No
```

Answer yes:

```
✔ The app is down for maintenance, the queue is paused
  → Bypass it at /shelf-ops-2026
```

```bash
curl -i https://shelf.example.com/
```

```
HTTP/2 503
...
retry-after: 300
...
```

The health endpoints stay up, so a load balancer keeps the servers. They add `"maintenance": true`:

```bash
curl http://127.0.0.1:3000/api/health/ready
```

```json
{"status":"ready","database":"reachable","redis":"reachable","disk":"ok","maintenance":true}
```

A tRPC call fails with `SERVICE_UNAVAILABLE` and the message. A browser that opens `https://shelf.example.com/shelf-ops-2026` gets a cookie and uses the app as usual, so you can check your work before the users come back. `nuxvel maintenance:status production` shows the state. It changes nothing, so it does not ask:

```bash
./nv maintenance:status production
```

```
STATE  SINCE                     RETRY  BYPASS  ALLOW  QUEUE   MESSAGE
down   2026-10-02T23:20:23.085Z  300s   secret  none   paused  Moving the links to a new server. Back at 10:00.
```

Bring the app back. Answer yes to the question:

```bash
./nv up production
```

```
✔ The app is up, the queue runs again
```

Without a terminal, such as in a script, `down production` and `up production` need `--force`. Without an environment, the three commands run against the app on your machine and the Redis of `.env`.

## What this tutorial leaves out

- Several apps on one server, each with its own deploy user. See [Deploying to a VPS: several apps on one server](../deploy.md#several-apps-on-one-server).
- Rolling deploys, for a server that cannot hold a second color. See [Rolling deploys](../deploy.md#rolling-deploys).
- Log shipping with Vector, and the Prometheus metrics of the monitor. See [Log shipping](../deploy.md#log-shipping) and [Metrics](../deploy.md#metrics).
- Security updates with `nuxvel server:upgrade`, and new credentials with `nuxvel app:rotate-credentials`. See [Security updates](../deploy.md#security-updates) and [Rotating credentials](../deploy.md#rotating-credentials).
- A restore of a lost server with `nuxvel server:restore production`. See [Restoring a lost server](../deploy.md#restoring-a-lost-server).
- Backfills for a contract migration on a large table. See [Backfills](../backfills.md).
