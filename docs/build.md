# Building for production

## Introduction

`nuxvel build` builds the app inside Linux containers with Docker Buildx and the `Dockerfile` of the app. It makes a Docker image, or an archive that you run with Node. Do not build on macOS or Windows and ship the result. The native dependencies must match the server.

## Test builds

Nuxt turns on its `test` option when `NODE_ENV` is `test` or when `TEST` is set. A build with this option turns off email verification and the breached-password check. It also records jobs, mail and outbound fetches instead of sending them.

A production build with the `test` option stops with an error, unless Vitest started it. `nuxvel test` and `nuxvel test:e2e` make their test build under Vitest. Before you run `nuxt build`, remove `NODE_ENV=test` and `TEST` from the environment.

## Docker images

```sh
nuxvel build --image=registry.example.com/my-blog:1.4.0
nuxvel build --platform=linux/amd64,linux/arm64 --image=registry.example.com/my-blog:1.4.0 --push
```

The command builds the `runtime` stage of the `Dockerfile`. The image:

- Runs `node .output/server/index.mjs` as the unprivileged `node` user.
- Listens on port 3000.
- Has a `HEALTHCHECK` on `/api/health/live`. See [Health endpoints](./observability.md#health-endpoints).

Use the image on any Docker host, such as Fly, Railway, Render or Kubernetes. The same image runs the queue worker when you set `NUXVEL_ROLE=worker`. See [Queues](./queues.md#running-jobs).

| Option | Use |
|---|---|
| `--image` | The image name and tag. Required for an image build. |
| `--platform` | Comma-separated platforms. The default is the platform of this machine, for example `linux/arm64`. |
| `--push` | Pushes the image to its registry. Without it, the command loads the image into the local Docker. |

The Node version comes from `.nvmrc`, through the `NODE_VERSION` build argument. Without `.nvmrc`, the `Dockerfile` uses its own default.

A build for a different CPU architecture runs under QEMU emulation and is slow. In CI, build each architecture on a native runner.

Without `--push`, a multi-platform build needs the containerd image store of Docker. Docker Desktop and OrbStack use it by default.

### Shutdown

On `SIGTERM` or `SIGINT`, the server stops. It does these steps:

1. It ends its open realtime streams at once. A stream stays open until the server ends it, so the HTTP close would otherwise wait for it.
2. It stops accepting requests.
3. It lets the requests in progress finish.
4. It closes its Redis and BullMQ connections, the mail transport, the storage client and the Postgres pool.
5. It exits.

## Archives

```sh
nuxvel build --artifact
nuxvel build --artifact --platform=linux/amd64 --format=zip
```

With `--artifact`, the command builds the `artifact` stage of the `Dockerfile`. It packs one archive for each platform into `dist/`, with a checksum file in `sha256sum` format next to it:

```
dist/my-blog-1.4.0-linux-arm64.tar.gz
dist/my-blog-1.4.0-linux-arm64.tar.gz.sha256
```

The file name is the `name` in `package.json` without its npm scope, the `version`, and the platform. When `package.json` has no version, the name does not include one.

| Option | Use |
|---|---|
| `--artifact` | Builds archives instead of an image. |
| `--platform` | Comma-separated platforms, one archive each. The default is the platform of this machine. |
| `--format` | `tar` (the default, `.tar.gz`) or `zip`. |

`--image` and `--push` are for image builds only. `--format` is for archives only. When you mix them, the command stops with exit code 2. With neither `--image` nor `--artifact`, the command also stops with exit code 2.

The archive holds:

| Path | Contents |
|---|---|
| `.output/` | The built server and its dependencies, for that platform. |
| `server/database/migrations/` | The migrations, for `nuxvel db:migrate`. |
| `nuxvel-manifest.json` | The [build manifest](#build-manifest). |
| `nuxvel-routes.json` | The output of [`nuxvel routes --json`](./cli.md#nuxvel-routes), which `nuxvel routes --diff-env` reads from the live release. The `Dockerfile` of a new app writes it; in an older app, add the step `RUN NUXT_DATABASE_URL=postgres://build@127.0.0.1/unused NUXT_AUTH_SECRET=build-time-route-list-only-not-a-secret npx nuxvel routes --json > nuxvel-routes.json` of the starter's `Dockerfile` to the `build` stage and copy the file into the `artifact` stage. The two variables in the step are placeholders: `nuxvel routes` needs them to load the app, and it does not connect to a database. |

### Running an archive

```sh
nuxvel build:verify my-blog-1.4.0-linux-arm64.tar.gz
tar -xzf my-blog-1.4.0-linux-arm64.tar.gz -C /srv/my-blog
cd /srv/my-blog
NUXT_DATABASE_OWNER_URL=... node .output/server/nuxvel/migrate.mjs
node .output/server/index.mjs
NUXVEL_ROLE=worker PORT=3001 node .output/server/index.mjs
```

On the machine that runs the archive, do these steps:

1. Verify the archive.
2. Extract it.
3. Run the migrations.
4. Start the server, and the worker on a different port.

Under [pm2](https://pm2.keymetrics.io), the server sends pm2 the `ready` message once it listens, so an app with `wait_ready: true` gets no traffic before then.

The archive holds the server, but not the CLI. Install `@nuxvel/cli` on that machine for `build:verify`, for example with `npm install -g @nuxvel/cli`. The migrations run without the CLI. See [Release entries](#release-entries).

## Release entries

```sh
NUXT_DATABASE_OWNER_URL=postgres://owner:secret@db.example.com/blog node .output/server/nuxvel/migrate.mjs
# nuxvel migrate: the database is up to date
```

`nuxt build` adds three entries next to the server, in `.output/server/nuxvel/`. `migrate.mjs` runs the pending migrations and exits. It exits `1` and applies nothing when a migration file changed after it ran on the database. It does not need the CLI, `drizzle-kit` or the source of the app. Run it one time for each release, before the new release gets traffic. When `NUXT_DATABASE_URL` is also set and uses a different role, it then removes the read rights of that role on the audit log. See [Audit log: the database refuses the reads](./audit.md#the-database-refuses-the-reads).

The build copies `server/database/migrations/` into `.output/server/nuxvel/migrations/`. The entry reads the migrations from there. It runs no [contract migration](./database.md#contract-migrations) unless `NUXVEL_CONTRACT_MIGRATIONS` names it, in a comma-separated list; `nuxvel deploy` sets it. With `NUXVEL_MIGRATE_RESULT=<file>`, it writes the migrations it applied and deferred to that file as JSON.

The entry connects with `NUXT_DATABASE_OWNER_URL`, or with `NUXT_DATABASE_URL` when the owner URL is not set. Give the owner URL to this entry only, not to the server or the worker. See [Database](./database.md). When a migration fails, the entry prints the error and exits with code 1. Without a database URL, it also exits with code 1.

In the Docker image, run the entry in place of the server:

```sh
docker run --rm --env NUXT_DATABASE_OWNER_URL=... registry.example.com/my-blog:1.4.0 node .output/server/nuxvel/migrate.mjs
```

The server of the image refuses to start in production without its [required variables](./security.md#env-validation-at-boot), among them `NUXT_AUDIT_CHAIN_SECRET`, and `NUXT_OG_IMAGE_SECRET` when `seo.ogImage` is on, as it is in the starter. Pass them with `--env`, or a `shared/.env` that `nuxvel app:create` filled.

### Maintenance entry

```sh
NUXT_DATABASE_OWNER_URL=... node .output/server/nuxvel/maintenance.mjs
```

`.output/server/nuxvel/maintenance.mjs` does the daily database work that needs the owner role. It creates the coming monthly partitions of the audit log. It exports the expired ones to storage and then drops them, so with `retentionMonths` set it also needs `NUXT_STORAGE_URL` and `NUXT_STORAGE_BUCKET`. Run it one time each day. It removes the read rights on the new partitions like the migrate entry. See [Audit log](./audit.md#exported-partitions). It connects and fails like the migrate entry.

`.output/server/nuxvel/tinker.mjs` opens the [tinker REPL](./cli.md#nuxvel-tinker) on the built server: it starts the server on a random port on 127.0.0.1, then reads statements from the terminal. It uses the same environment as the server. `nuxvel tinker <env>` runs it on a VPS. With a command as its first argument, it runs that command and exits, with no REPL: `nuxvel down <env>`, `nuxvel up <env>` and `nuxvel maintenance:status <env>` use it. The server entry itself never runs a command.

## Build manifest

```json
{
  "app": "my-blog",
  "version": "1.4.0",
  "commit": "3f1c9e2…",
  "source": "local",
  "builtAt": "2026-09-23T07:43:50.000Z",
  "node": "24.21.0",
  "platform": "linux",
  "arch": "arm64",
  "libc": "glibc",
  "nuxt": "4.5.2",
  "nuxvel": "0.4.0",
  "migrations": 12
}
```

`nuxvel build:manifest` writes `nuxvel-manifest.json`. The `Dockerfile` runs it after `nuxt build`, so the manifest describes the machine that built the app.

| Field | Contents |
|---|---|
| `app`, `version` | The `name` and `version` from `package.json`. `app` is `"app"` when there is no name. `version` is `null` when there is no version. |
| `commit` | The git commit, or `null`. |
| `source` | `ci` when the `CI` variable is set, `local` in all other cases. |
| `builtAt` | The build time. |
| `node`, `platform`, `arch`, `libc` | The Node version, OS, CPU architecture and C library of the build machine. |
| `nuxt`, `nuxvel` | The installed versions of `nuxt` and `@nuxvel/nuxt`. |
| `migrations` | The number of `.sql` files in the migrations folder. |

The Docker build cannot see git or `CI`. `nuxvel build` passes them in as the `NUXVEL_GIT_COMMIT` and `NUXVEL_BUILD_SOURCE` build arguments. When these variables are set, the manifest uses them.

To build without Docker, on a Linux CI runner, run this command. The manifest then reads git and `CI` itself:

```sh
npx nuxt build && npx nuxvel build:manifest
```

## Bundle budget

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nuxvel: { perf: { bundle: { maxInitialKb: 400 } } },
});
```

Set `nuxvel.perf.bundle.maxInitialKb` to limit the JavaScript and CSS that the first load of a page needs. `nuxvel build:manifest` then reads the client manifest of the Nuxt build. For each page, it adds up the gzipped size of the app entry, the page chunk and their static imports:

```
  pages/index.vue  61.3 KB initial JS and CSS, gzipped
  pages/posts/index.vue  74.8 KB initial JS and CSS, gzipped
✖ pages/posts/index.vue over the 70 KB initial bundle budget
  → Load the heavy code with a lazy component or a dynamic import(), or raise nuxvel.perf.bundle.maxInitialKb
```

When a page is over the budget, the command exits `1` and writes no manifest. The Docker build runs it after `nuxt build`, so `nuxvel build` fails too. Without `maxInitialKb`, the command measures nothing.

The starter pages weigh 256 to 337 KB gzipped. Every page loads the same shared code: the app entry chunk (about 117 KB, with Vue, Nuxt, zod and the tRPC client), the Nuxt UI chunks (about 30 KB and more) and the stylesheet (about 29 KB). The auth client is one chunk of about 11 KB. That is why the example sets 400. Run the command once, then set the budget a little above your heaviest page and lower it as you cut.

Code that a page loads later, such as a lazy component or a dynamic `import()`, does not count.

## Verifying an archive

```sh
nuxvel build:verify dist/my-blog-1.4.0-linux-arm64.tar.gz
# ✔ dist/my-blog-1.4.0-linux-arm64.tar.gz verified: my-blog 3f1c9e2…, linux/arm64 glibc, Node 24.21.0
```

Run `nuxvel build:verify` before you run an archive on a machine. It checks that:

1. The archive matches its `.sha256` file. A missing checksum file fails.
2. The archive holds `nuxvel-manifest.json`.
3. The platform, CPU architecture and C library in the manifest match this machine.
4. The Node major version in the manifest matches the Node that runs here.

A checksum problem stops the check at step 1. Otherwise, the command prints each problem and exits with code 1:

```
✖ dist/my-blog-1.4.0-linux-arm64.tar.gz failed verification
  built for linux/arm64, this machine is linux/x64
```

Add `--json` to print the result as JSON.

## Open tabs after a deploy

A browser tab that the old build loaded keeps running after you deploy a new build. Nuxt brings the tab to the new build on the next navigation, never while the user stays on a page:

- Each hour, the tab fetches `/_nuxt/builds/latest.json`. When the build ID there is different, the next navigation loads the new page from the server, not in the tab.
- When the tab cannot load a code chunk of its build, for example because the chunk is gone from the server, it loads the page that it navigates to from the server.

Nuxt does this by default. Do not turn off `experimental.appManifest` or `experimental.emitRouteChunkError`. To check more often, set the interval in milliseconds:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  experimental: { checkOutdatedBuildInterval: 10 * 60 * 1000 },
});
```

Keep the files of the previous build under `/_nuxt/` on the server for some days after a deploy. An open tab of the old build can then load its chunks until its next navigation.

## Serverless presets

```
[nuxvel]  WARN  the "vercel" preset runs the server as serverless functions, but jobs need a long-running nuxvel queue:work worker, and channels hold server-sent event streams open longer than a function runs. Deploy the app with a server preset such as node-server.
```

nuxvel needs a long-running server. `nuxt build` and `nuxt prepare` warn when the Nitro preset is a serverless one: `aws-lambda`, `azure`, `cloudflare`, `deno-deploy`, `firebase`, `netlify` or `vercel`, and their variants. The warning names what the preset cannot run:

- `server/jobs/`, `server/listeners/`, `server/schedules/` and `server/mail/` need the queue worker.
- `server/channels/` holds realtime streams open.

When `nuxt.config.ts` sets no `nitro.preset`, `nuxvel build` builds with the `node-server` preset and shows no warning.

## See also

- [CLI](./cli.md#nuxvel-build)
- [Queues](./queues.md#running-jobs)
- [Observability](./observability.md#health-endpoints)
- [Database](./database.md#migrations)
- [Starting a new app](./create.md)
