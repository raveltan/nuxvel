# Deploying to a VPS

nuxvel deploys an app to a VPS that it sets up for you. `nuxvel.deploy.ts` at the app root says where and how.

## `nuxvel.deploy.ts`

The file default-exports `defineDeploy()` from `@nuxvel/cli/deploy`. Commit it. The file requires `app` and at least one environment. An environment requires only `servers`, `arch` and `domains`:

```ts
import { defineDeploy } from "@nuxvel/cli/deploy";

export default defineDeploy({
  app: "tasks",
  environments: {
    production: {
      servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] }],
      arch: "amd64",
      domains: ["tasks.example.com"],
    },
  },
});
```

`app` names the app's folder, database and processes on the server. It holds lowercase letters, digits and dashes. It must not be `default`, `nuxvel`, `postgres`, `template0` or `template1`: the server uses these names for its own Redis users and Postgres databases. It must not end with `-rehearsal`: a [rehearsal](#rehearsing-a-restore) (`server:restore --from=<env>:...`) uses that name for its temporary app, and the nightly backup skips such an app.

Each key of `environments` is an environment name, such as `production` or `staging`. An environment has these options:

| Option | Value | Default |
|---|---|---|
| `servers` | Exactly one server: its `host`, the `user` that deploys the app (not `root`, `server:setup` creates it), and its `roles` (`web`, `worker`, `database`, `redis`, `storage`, at least one). The CLI checks `roles` but does not use them yet: the one server runs every role. Give each environment its own server: the app has the same folder, database, Redis user and buckets in every environment, so `nuxvel.deploy.ts` refuses two environments with the same `host` | required |
| `arch` | CPU architecture of the server, `amd64` or `arm64`. `server:setup` stops when the server has a different architecture | required |
| `domains` | Domains that serve the app | required |
| `redirects` | Redirects, from → to. Each side is a domain, a path, or both | none |
| `filesDomain` | Domain that serves the app's files, see [Serving the app with Caddy](#serving-the-app-with-caddy) | none |
| `processes` | Number of `web` and `worker` processes, or `"auto"` to size them from the server memory | `"auto"` for both |
| `deploy.strategy` | `blue-green` or `rolling` | `blue-green` |
| `deploy.hold` | Seconds that the old processes stay ready for a switch-back | `600` |
| `deploy.smoke` | Paths to request before the switch | `["/"]` |
| `alerts` | Where the [monitor](#alerts) sends its alerts: an `email` address with the `smtp` URL of a relay, a `webhook` URL, and a `heartbeat` URL it requests every minute. A setting of the server, not of the environment | none |
| `logs` | `sink`: a [Vector sink](https://vector.dev/docs/reference/configuration/sinks/) to ship the logs to. A setting of the server, not of the environment | logs stay on the server |
| `keepReleases` | Number of releases to keep on the server | `5` |
| `backups.offsite` | An S3-compatible bucket for off-site backups: `endpoint`, `bucket`, optional `region`, `accessKeyId` and `secretAccessKey`. A setting of the server, not of the environment | none |
| `backups.restoreDrill` | Restore the newest backup into a scratch database every week, and check it | `false` |

A fuller environment:

```ts
production: {
  servers: [{ host: "203.0.113.10", user: "deploy", roles: ["web", "worker", "database", "redis", "storage"] }],
  arch: "amd64",
  domains: ["tasks.example.com"],
  redirects: {
    "www.tasks.example.com": "tasks.example.com",
    "/old-pricing": "/pricing",
    "tasks.example.com/blog": "blog.example.com",
  },
  filesDomain: "files.tasks.example.com",
  processes: { worker: 2 },
  deploy: { hold: 300, smoke: ["/", "/sign-in"] },
  alerts: {
    email: "ops@example.com",
    smtp: process.env.NUXVEL_ALERTS_SMTP,
    webhook: process.env.NUXVEL_ALERTS_WEBHOOK,
    heartbeat: "https://hc-ping.com/5b1c0f6e-2d7a-4c1e-9a3b-8f0d6e4c2a1b",
  },
  logs: { sink: { type: "http", uri: "https://logs.example.com" } },
  backups: {
    offsite: {
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      bucket: "tasks-backups",
      accessKeyId: process.env.NUXVEL_OFFSITE_ACCESS_KEY_ID,
      secretAccessKey: process.env.NUXVEL_OFFSITE_SECRET_ACCESS_KEY,
    },
  },
},
```

## Credentials

Never write a credential in `nuxvel.deploy.ts`. Read it from `process.env`, and put the values in `.env.deploy` at the app root. The CLI loads `.env.deploy` before it reads `nuxvel.deploy.ts`. A variable that is already set in the shell wins, so CI can pass its secrets as environment variables instead. The CLI stops with `is not set, add it to .env.deploy` when a value in `alerts`, `logs.sink` or `backups.offsite` reads a variable that is not set. The same message appears for an `endpoint` or `bucket` of `backups.offsite` that reads an unset variable. So a missing credential cannot turn off alerts, log shipping or off-site backups without a message. Each command checks the whole file, not only the environment you name. So the variables of every environment must be set, also in CI.

`.env.deploy` is git-ignored and left out of the Docker build (the `.gitignore` and `.dockerignore` of `create-nuxvel` list it. In an older app, add it to these files). Commit a `.env.deploy.example` with the names and no values, like `.env.example`:

```bash
NUXVEL_ALERTS_WEBHOOK=
NUXVEL_OFFSITE_ACCESS_KEY_ID=
NUXVEL_OFFSITE_SECRET_ACCESS_KEY=
```

## Setting up the server

`nuxvel server:setup <env>` sets up the server of an environment. The server runs Ubuntu 26.04 on the `arch` of the environment. The setup stops on a different release or architecture. The CLI connects with your `ssh` as `root`, so a `Host` entry in `~/.ssh/config` applies. Run it from the app root: the server gets the Node.js major version of `.nvmrc`. Add your SSH key to root first (`ssh-copy-id root@203.0.113.10`): the setup turns off password login, and stops when root has no key.

```bash
npx nuxvel server:setup production --dry-run
# Memory budget of 7936 MB: Postgres 1984 MB, Redis 793 MB, SeaweedFS and Caddy 396 MB, app processes 4763 MB
# ~ create /srv/nuxvel
# ~ create /usr/local/lib/nuxvel
# ~ set the time zone to UTC
# ...
# ✔ Dry run: <n> changes to make on root@203.0.113.10, nothing changed

npx nuxvel server:setup production
# ✔ Made <n> changes on root@203.0.113.10

npx nuxvel server:setup production
# ✔ root@203.0.113.10 is set up, nothing to change
```

Each line with `~` is a change, and `<n>` is the number of these lines. The number depends on the server and on the settings (`logs.sink`, `alerts` and `backups.offsite` add changes). The setup checks the server before each change, so you can run it again at any time: a second run changes nothing. `--dry-run` shows the changes and makes none on the server. But on the first connection, it pins the server's [SSH host key](#ssh-host-key) in `.nuxvel/known_hosts`, as a real run does.

The setup makes:

- The `user` of the server (`deploy` above), with root's SSH keys and no password. Each run adds the keys of root that the user does not have yet. It keeps the keys that only the user has, such as the key of [CI](#deploying-from-github-actions). It deploys the app and runs its processes. With `sudo` it can run only three nuxvel scripts: [`caddy-site`](#serving-the-app-with-caddy), which writes an app's Caddy site, [`erasure`](#erasures-and-restores), which logs the erasure of a user outside the database, and `assets`, which puts the hashed assets of a release in the folder that Caddy serves. The rule is in `/etc/sudoers.d/nuxvel-<user>`, one file for each user. The scripts change only an app whose folder the user owns, so an app with another `user` cannot change the apps of this user. See [Several apps on one server](#several-apps-on-one-server). The other scripts in `/usr/local/lib/nuxvel/` (backup, restore, monitor, metrics and `caddy-reload`) run as root only. A server that an earlier setup made gets this narrower rule on the next `server:setup`. The root scripts that read an app's database connect to `127.0.0.1:5432` with the role and database of the server registry. They take only the password from the env files of the app, so nothing else in those files changes how they connect.
- SSH with keys only: no password login, and root logs in with a key only.
- fail2ban, which bans an address after repeated failed SSH logins.
- A firewall that allows only ports 80 and 443 and the SSH port of the connection that the setup uses (22 by default). A run on another SSH port adds that port and keeps the rules of earlier runs.
- Security updates that install every day, and `needrestart`, which finds the services to restart after one (see [Security updates](#security-updates)).
- The UTC time zone and a 2 GB swap file.
- Node.js at the major version of `.nvmrc` (the version the app is built with), from the NodeSource repo. The setup does not install an older major: when the server runs a higher major than `.nvmrc`, it stops.
- pm2 6, which starts on boot as the deploy user, with its logs rotated daily.
- Caddy 2.11.4, with automatic TLS. The setup installs the `.deb` of the GitHub release and checks its SHA-512 checksum. Thus the daily security updates do not update Caddy: a new Caddy comes with a nuxvel release that moves the pin. The setup removes the Caddy apt repo that an earlier setup added, because that repo is signed with an expired key. It serves each app from a site file in `/etc/caddy/sites/`. It reads the app assets from `/srv/nuxvel/assets/<app>/`, which only root writes, and it is not in the group of the deploy user. A setup takes Caddy out of that group when an earlier setup put it in. Its admin API listens only on the unix socket `/var/lib/caddy/admin.sock` (mode 600, owner `caddy`), not on TCP port 2019. Thus only root and Caddy can change the config, and an app or an SSRF cannot. A reload stays graceful. On a server that an earlier setup made, the next `server:setup` restarts Caddy once to move the admin API to the socket.
- Postgres 18, only on localhost, with password login and at most 100 connections. Its memory settings come from the server RAM. It loads `pg_stat_statements` and logs each statement that takes 500 ms or more, for `nuxvel server:status`.
- Two Redis instances, only on localhost: `durable` on port 6379 (saved to disk, never drops keys) for queues and app data, and `cache` on port 6380 (not saved, drops the least recently used keys when full). Each has its own admin user and password, in `/etc/nuxvel/redis-<name>.password` (root only), and no default user.
- SeaweedFS for the app files, with its S3 API only on localhost port 8333 and the data in `/srv/nuxvel/storage`. Its S3 admin keys are in `/etc/nuxvel/seaweedfs.env` (root only). Each new bucket starts with one volume of at most 1 GB, and the number of volumes follows the free disk space, so every app on the server can store files. Only root and the `seaweedfs` user can connect to its filer, volume and master ports. The apps and Caddy reach only the S3 port 8333, where the S3 keys apply. The rules are in `/etc/nuxvel/seaweedfs.nft` and load each time SeaweedFS starts. The timer `nuxvel-storage-lifecycle` applies the lifecycle rules of every bucket each hour, as the `seaweedfs` user. So SeaweedFS deletes the files under `tmp/` of each app about one day after the upload.
- The nightly [backup](#backups) of every app, with the timer `nuxvel-backup` and the helper `/usr/local/lib/nuxvel/backup`, uploaded to the [off-site bucket](#off-site-backups) when `backups.offsite` is set.
- The [monitor](#monitoring), which checks the server and its apps every minute, with the timer `nuxvel-monitor` and the helper `/usr/local/lib/nuxvel/monitor`.

### Log shipping

Without `logs`, the logs stay on the server: pm2 rotates the app logs daily and keeps 14 days, and Caddy rolls its access logs. With `logs.sink`, the setup installs [Vector](https://vector.dev) and ships the pm2 logs of every app, Caddy's access logs and the monitor's events to the sink:

```ts
production: {
  // ...
  logs: {
    sink: {
      type: "http",
      uri: "https://logs.example.com/ingest",
      encoding: { codec: "json" },
      auth: { strategy: "bearer", token: process.env.LOGS_TOKEN },
    },
  },
},
```

The sink is a [Vector sink](https://vector.dev/docs/reference/configuration/sinks/) as Vector documents it, with any `type`. Vector reads the files from their start, and a line that is JSON (the pm2 logs of a production app, Caddy's access log) becomes the event's fields, next to `message`, `file` and `host`. Caddy's access log holds no query strings and no `Referer` headers (see [Serving the app with Caddy](#serving-the-app-with-caddy)). The setup checks the config with `vector validate` first and stops with Vector's error when the sink is wrong. The config is in `/etc/vector/vector.yaml` (root and Vector only), since a sink can hold a token.

`logs.sink` is a setting of the server: Vector ships the logs of every app on the server to one sink. The last `server:setup` that has `logs.sink` sets the sink. A `server:setup` without `logs.sink`, for example of another app on the same server, does not change the sink. To stop the log shipping, run `systemctl disable --now vector` and remove `/etc/vector/vector.yaml` on the server.

### Uptime checks

Each setup ends with the URLs to add to an external uptime service, such as UptimeRobot or Better Stack. It checks the server from outside, so it notices when the whole server is down:

```
Add these URLs to an external uptime service, such as UptimeRobot or Better Stack:
  https://tasks.example.com/api/health/ready
```

There is one URL per domain of the environment. `/api/health/ready` fails while the app cannot reach its database or Redis.

### SSH host key

The first connection to the server pins the server's SSH host key in `.nuxvel/known_hosts` at the app root. Usually this is the first `server:setup`, also with `--dry-run`. The setup prints the fingerprint:

```
SSH host key of 203.0.113.10: ssh-ed25519 SHA256:q4Vb9Zk0mJ1sXo3yF2hR7tLwP8cN6aE5dG0uIiKzY1c
  → Pinned in .nuxvel/known_hosts: commit it, the CLI and CI refuse another key
```

Compare the fingerprint with the one your provider shows for the server, then commit the file. The CLI checks the server against this file only, not against `~/.ssh/known_hosts`, so every machine and CI checks the same key. The file keeps the key under the `host` of `nuxvel.deploy.ts`, also when your `~/.ssh/config` gives that host a different `HostName` or `Port`. When the key changes, the CLI stops before it runs anything:

```
✖ The SSH host key of 203.0.113.10 is not the one pinned in .nuxvel/known_hosts
  → If you rebuilt the server, remove its line from .nuxvel/known_hosts and run server:setup again. Otherwise do not connect.
```

### Memory budget

The setup splits the server RAM and prints the split:

```
Memory budget of 7936 MB: Postgres 1984 MB, Redis 793 MB, SeaweedFS and Caddy 396 MB, app processes 4763 MB
```

The setup rounds the RAM down to a multiple of 256 MB. Thus a kernel update that changes the RAM the server reports by a few MB does not change the memory settings, and a second setup does not restart Postgres or Redis. Postgres gets a quarter, the two Redis instances a tenth, SeaweedFS and Caddy a twentieth, and the app processes the rest. Postgres and Redis take their memory settings from their share. Use a server with at least 2 vCPU and 4 GB of RAM: the setup warns on a smaller one.

### Recovery key

The first setup makes an [age](https://age-encryption.org) key pair, the recovery key. The config [backups](#backups) of the server are encrypted to it. The server keeps only the public key, in `/etc/nuxvel/recovery.pub`. The setup shows the private key one time:

```
▲ Recovery key, shown this one time. It decrypts the config backups of this server, which keeps only its public key:

  AGE-SECRET-KEY-1QYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQS

◆  Recovery key and off-site credentials stored outside the server?
│  ○ Yes / ● No
```

Store it outside the server, with the credentials of the off-site backup bucket, for example in a password manager. You need both to restore the server after it is lost. The setup asks until you answer yes. Run the first setup in a terminal: without one it cannot ask, so it stops, and the server does not keep the key. The next setup makes a new one.

### Server registry

The setup writes `/srv/nuxvel/server.json`, which records what runs on the server: the Node.js version, the number of vCPUs, each service with its version and port, and the memory budget. Its `apps` key lists the apps on the server, which [`app:create`](#creating-the-app-on-the-server) adds. A second setup keeps them.

### Several apps on one server

Each app has its own database, Redis user and S3 user. The processes and files are kept apart by the `user` of the environment in `nuxvel.deploy.ts`:

- Apps with different values of `user` cannot read each other's `shared/.env` and `owner.env`, and cannot change each other's processes. Run `server:setup` one time for each `user`. Each user gets its own sudo rule.
- Apps with the same `user` are not kept apart. Each of them reads the other's env files, with the database, Redis, S3 and auth secrets, and controls the other's processes. This is the case when you do not set a `user` for each app. Give each app its own `user` when you do not trust all the code of all the apps on the server.
- Any local user can listen on the port of another app that no process uses yet. Nuxvel does not stop this.
- `server:restore` restores all apps as the `user` of the config that runs it, so after a restore of a whole server the apps share one `user` again.
- The log shipping reads the pm2 logs of the `user` of the last `server:setup` only.

## Creating the app on the server

`nuxvel app:create <env>` creates the app's resources on the server of an environment. Run `server:setup` first. Like the setup, it connects as `root`, runs again safely and takes `--dry-run`:

```bash
npx nuxvel app:create production
# ~ create /srv/apps
# ~ create /srv/apps/tasks
# Ports of tasks on localhost: blue 3000-3009, green 3010-3019
# ~ record tasks in the server registry /srv/nuxvel/server.json
# ~ create /srv/apps/tasks/releases
# ~ create /srv/apps/tasks/shared, which only deploy may read
# ~ create /srv/nuxvel/assets/tasks/_nuxt, which only root may write and Caddy may read
# ~ write /srv/apps/tasks/state.json with no release yet
# ~ create the database role tasks_owner, its URL in /srv/apps/tasks/shared/owner.env
# ~ create the database role tasks_app, its URL in /srv/apps/tasks/shared/.env
# ~ create the database tasks, owned by tasks_owner, with data rights for tasks_app
# ~ run .output/server/nuxvel/maintenance.mjs of tasks every day with the timer nuxvel-tasks-maintenance
# ~ create the Redis user tasks on durable for the keys tasks:*, its URL in /srv/apps/tasks/shared/.env
# ~ create the Redis user tasks on cache for the keys tasks:*, its URL in /srv/apps/tasks/shared/.env
# ~ set NUXT_REDIS_PREFIX=tasks: in /srv/apps/tasks/shared/.env
# ~ create the bucket tasks-private
# ~ create the bucket tasks-public
# ~ create the S3 user tasks for tasks-private and tasks-public, its URL in /srv/apps/tasks/shared/.env
# ~ set NUXT_STORAGE_BUCKET=tasks-private in /srv/apps/tasks/shared/.env
# ~ let anyone read the files of tasks-public
# ~ allow uploads and downloads from tasks.example.com in tasks-private
# ~ allow uploads and downloads from tasks.example.com in tasks-public
# ~ delete the files under tmp/ of tasks-private after one day
# ~ set a random NUXT_AUTH_SECRET in /srv/apps/tasks/shared/.env
# ~ set a random NUXT_AUDIT_CHAIN_SECRET in /srv/apps/tasks/shared/.env
# ~ set a random NUXT_OG_IMAGE_SECRET in /srv/apps/tasks/shared/.env
# ~ set NUXT_SITE_URL=https://tasks.example.com in /srv/apps/tasks/shared/.env
# ✔ Made 26 changes on root@203.0.113.10

npx nuxvel app:create production
# ✔ tasks on root@203.0.113.10 is set up, nothing to change
```

It makes:

- The app folder `/srv/apps/<app>/`, owned by the deploy user:

  ```
  /srv/apps/tasks/
    releases/              one folder per release
    shared/.env            the runtime settings, never in a release
    shared/owner.env       the owner database URL
    state.json             the live color, the release of each color, the applied contract migrations
                           and the kept releases that finished their hold
  ```

  Only the `user` of the app reads the releases and the env files. Apps with the same `user` can read each other's files. Caddy reads nothing in this folder. It serves the hashed assets from `/srv/nuxvel/assets/<app>/_nuxt/`, which only root writes. `state.json` starts with no release. A second `app:create` keeps it. On a server that an earlier version made, run `server:setup`, then `app:create` for each app: it moves the old `shared/assets/` into the new folder.
- A block of 20 ports on localhost: the lower half for the blue processes, the upper half for the green ones. It takes the first free block from port 3000, so two apps on one server never share a port.
- The pm2 names of the app's processes, with the app and the color: `tasks-web-blue`, `tasks-worker-blue`, `tasks-web-green` and `tasks-worker-green`.
- A Postgres database named after the app (`time-off` gets `time_off`), with two roles, each with its own random password:
  - The owner role `<app>_owner` owns the database. Migrations and the maintenance entry connect with it. Its URL is `NUXT_DATABASE_OWNER_URL` in `shared/owner.env`.
  - The runtime role `<app>_app` can read and write the rows of the owner's tables, but cannot create, change or drop a table. The server and the worker connect with it. Its URL is `NUXT_DATABASE_URL` in `shared/.env`. It can add rows to the audit log, but it cannot read their content. See [Audit log: the database refuses the reads](./audit.md#the-database-refuses-the-reads).

  Both files are in `/srv/apps/<app>/shared/`, readable only by the deploy user. No other role can connect to the database, so another app on the server cannot read it, unless that app has the same `user`. See [Database](./database.md#configuration).
- A Redis user named after the app on each Redis instance, each with its own random password. It can use only the keys and pub/sub channels that start with `<app>:`, and no admin or dangerous command (`FLUSHALL`, `CONFIG`, `KEYS`, ...). Its URLs are `NUXT_REDIS_URL` (the durable instance, for queues, realtime, rate limits, locks, maintenance mode and flag state) and `NUXT_REDIS_CACHE_URL` (the cache instance) in `shared/.env`, with `NUXT_REDIS_PREFIX=<app>:`, so every key of the app is under its prefix. See [Redis](./redis.md#key-prefix).
- Two SeaweedFS buckets and an S3 user named after the app, with its own random keys. The user can read, write and delete the files of its two buckets, but cannot change a bucket's settings or reach another app's buckets. Its URL is `NUXT_STORAGE_URL` in `shared/.env`, with `NUXT_STORAGE_BUCKET=<app>-private`. See [Storage](./storage.md#configuration).
  - `<app>-private` holds the uploads. Nobody reads it without a signed URL: SeaweedFS has no public-access-block setting, so each run turns off anonymous access to it again. Its lifecycle rule deletes the files under `tmp/` after one day, like [`storage:setup`](./storage.md#creating-the-bucket).
  - `<app>-public` holds files that anyone may read, without a signed URL. Nobody writes or lists it without the keys.
  - Both buckets allow `GET`, `HEAD` and `PUT` from `https://<domain>` for each of the environment's `domains`, so the browser uploads straight to storage.
  - With `filesDomain`, `NUXT_STORAGE_PUBLIC_URL=https://<filesDomain>` in `shared/.env`, so the upload and read URLs point browsers at the files domain. Without it, the line is removed.
- A random `NUXT_AUTH_SECRET` in `shared/.env`, when it has none of at least 32 characters. See [Auth](./auth.md).
- A random `NUXT_AUDIT_CHAIN_SECRET` in `shared/.env`, when it has none. `app:create` never replaces it. A server set up before this variable existed has none, and `nuxvel deploy` stops with `NUXT_AUDIT_CHAIN_SECRET: Required in production`. Run `nuxvel app:create <env>` one time to add it.
- A random `NUXT_OG_IMAGE_SECRET` in `shared/.env`, when it has none. The starter needs it in production, because it turns on `seo.ogImage`. See [SEO](./seo.md#the-signing-secret). `app:create` never replaces it. A server set up before this variable existed has none, and `nuxvel deploy` stops with `NUXT_OG_IMAGE_SECRET: Required in production`. Run `nuxvel app:create <env>` one time to add it.
- `NUXT_SITE_URL=https://<first domain>` in `shared/.env`, when it has none. The auth mail links and the canonical links start with it. To use another origin, change it with `env:pull` and `env:push`. `app:create` does not overwrite it. A server that `app:create` set up before this variable existed has none, and `nuxvel deploy` stops with `NUXT_SITE_URL: Required in production`. Run `nuxvel app:create <env>` one time to add it.
- `app:create` writes no `NUXT_MAIL_URL`, because only you know the SMTP server. A production server does not start without it. So `nuxvel deploy` and `env:push` stop with `NUXT_MAIL_URL: Required in production`, the same check as the boot check, when `shared/.env` has none. Set it before the first deploy: run `nuxvel app:create <env>`, then `nuxvel env:pull <env>`, add `NUXT_MAIL_URL` to `.nuxvel/<env>.env`, and run `nuxvel env:push <env>`. A first deploy without it creates the app, and then stops at this check. Set the variable, then deploy again.
- A systemd timer, `nuxvel-<app>-maintenance.timer`, that runs the [maintenance entry](./build.md#maintenance-entry) of the current release once a day, as the deploy user with `shared/.env` and `shared/owner.env`. It does nothing until the first deploy.
- With `backups.restoreDrill: true`, a systemd timer, `nuxvel-<app>-restore-drill.timer`, that restores the newest backup of the app into a scratch database every Sunday after 04:00 UTC, checks it and drops it. See [Restoring a backup](#restoring-a-backup). Without it, `app:create` removes the timer.

It records them in the app's entry of the [server registry](#server-registry), without the passwords, with the environment's `domains`, `redirects` and `filesDomain` for its [Caddy site](#serving-the-app-with-caddy):

```json
"apps": {
  "tasks": {
    "folder": "/srv/apps/tasks",
    "domains": ["tasks.example.com"],
    "redirects": {},
    "filesDomain": null,
    "ports": { "blue": [3000, 3009], "green": [3010, 3019] },
    "pm2": {
      "blue": ["tasks-web-blue", "tasks-worker-blue"],
      "green": ["tasks-web-green", "tasks-worker-green"]
    },
    "database": { "name": "tasks", "owner": "tasks_owner", "runtime": "tasks_app" },
    "redis": { "user": "tasks", "prefix": "tasks:", "instances": ["durable", "cache"] },
    "buckets": { "user": "tasks", "private": "tasks-private", "public": "tasks-public" },
    "timers": ["nuxvel-tasks-maintenance.timer"]
  }
}
```

With `backups.restoreDrill: true`, `timers` also lists `nuxvel-<app>-restore-drill.timer`.

## Serving the app with Caddy

Caddy serves each app from its site file, `/etc/caddy/sites/<app>.caddy`. `server:setup` installs `/usr/local/lib/nuxvel/caddy-site`, which writes that file from the app's entry in the server registry and points it at the web port of one color. The deploy user runs it with `sudo`:

```bash
sudo /usr/local/lib/nuxvel/caddy-site tasks blue
# Caddy serves tasks from blue on 127.0.0.1:3000
```

For each of the `domains`, the site:

- Logs each request as JSON to `/var/log/caddy/<app>.access.log`, which a deploy reads to watch the new release. The log replaces the query string and the token in `/reset-password/<token>` with `REDACTED`, and it does not keep the `Referer` header. So reset, verification and OAuth tokens and signed URLs do not go into the log or to a log sink.
- Compresses responses with zstd or gzip.
- Refuses a request body over 8 MB with HTTP 413, also when the body has no `Content-Length`. 8 MB is the largest default limit of the app (`security.requestSizeLimiter.maxUploadFileRequestInBytes`), so the app answers first for every smaller body. Caddy is a second limit, and it stops a body that the app cannot bound before it reaches Node. An app that sets a limit above 8 MB must expect Caddy to refuse a body over 8 MB.
- Serves `/_nuxt/*` from `/srv/nuxvel/assets/<app>/`, with `Cache-Control: public, max-age=31536000, immutable`.
- Sends every other request to the color's web port, retries it for up to 5 seconds, checks the port with `/api/health/live`, and passes each chunk on at once, so server-sent events stream.

Caddy adds no security headers: the app sets them.

Each entry of `redirects` becomes a permanent (301) redirect:

| Entry | Redirect |
|---|---|
| `"www.tasks.example.com": "tasks.example.com"` | Every URL of `www.tasks.example.com` to the same path and query on `tasks.example.com` |
| `"/old-pricing": "/pricing"` | `/old-pricing` on each domain to `/pricing` |
| `"tasks.example.com/blog": "blog.example.com/tasks"` | `/blog` on `tasks.example.com` to `https://blog.example.com/tasks` |

A domain that only redirects answers 404 on its other paths.

With `filesDomain`, the site also serves that domain, with its own TLS certificate. It sends the requests for the app's two buckets (`/<app>-private/...` and `/<app>-public/...`) to SeaweedFS on localhost, adds `X-Content-Type-Options: nosniff` so a browser never guesses a file's type, adds `Content-Security-Policy: sandbox` so an HTML or SVG file that a browser opens cannot run a script, and answers 404 on every other path. The signed URLs of the app point there. Files in `<app>-public` need no signature.

`caddy-site` validates the whole Caddy config before the reload. It prints the output of `caddy validate` only when the validation fails. When Caddy refuses the config, `caddy-site` puts the previous site file back, leaves Caddy as it was, and exits with code 1.

## App processes

pm2 runs each color of an app from its ecosystem file in the app folder, `ecosystem.blue.config.cjs` or `ecosystem.green.config.cjs`. Each starts the built server of the color's release through the color's link, `blue/.output/server/index.mjs` or `green/.output/server/index.mjs` (`blue` and `green` link to a folder in `releases/`), never `current`, so the two colors can run different releases:

- `<app>-web-<color>`: the web processes, in cluster mode on the first port of the color, on 127.0.0.1. pm2 waits up to 15 seconds for each one to send `ready` (the server sends it once it listens) and gives it 10 seconds to finish its requests when it stops.
- `<app>-worker-<color>`: the [queue workers](./queues.md#running-jobs), in fork mode with `NUXVEL_ROLE=worker`, on the next ports of the color. pm2 gives each one 30 seconds to finish its jobs when it stops.

Every process reads `shared/.env` when it starts (Node's `--env-file`), so the settings are not stored in pm2. pm2 restarts a process that uses more than 512 MB. Each process runs with `NUXT_NUXVEL_SECURITY_TRUST_PROXY=loopback`, so the [client IP](./security.md#client-ip-behind-a-proxy) comes from Caddy's `X-Forwarded-For`, and a request that reaches the port from anywhere else cannot forge it. Caddy also removes a `Forwarded` header that the client sends.

`processes` in `nuxvel.deploy.ts` sets how many of each run in a color. With `"auto"`, the default, the counts come from the memory budget:

- `worker`: 1.
- `web`: the app's share of the app-process memory, in 512 MB processes. The apps on the server share that memory evenly. From that count, the CLI subtracts the workers, then halves the result to keep room for the processes of the other color during a deploy. It is at most the number of vCPUs, and at least 1.

A 4 GB server with one app runs 1 web process and 1 worker. A color has ports for at most 9 workers.

Every process of every app on the server shares the 100 Postgres connections. 10 stay free for migrations and admin work. The rest are split between the processes, counting two colors of each app, since both run during a deploy. Each process gets that many connections, at most 10, as `NUXT_DATABASE_POOL_MAX`. When even one connection per process does not fit, the deploy stops and asks for fewer `processes`.

## Deploying

`nuxvel deploy <env>` deploys the app to the server of an environment:

```bash
npx nuxvel deploy production
# ◇  Built linux/amd64 (123.4s)
# ~ extract the release 20260927T100000Z-abc1234 into /srv/apps/tasks/releases/20260927T100000Z-abc1234, with shared/.env
# ~ copy its hashed assets into /srv/nuxvel/assets/tasks/_nuxt
# nuxvel migrate: the database is up to date
# ~ start tasks-web-green on 127.0.0.1:3010
#   / answers 200
# ~ start tasks-worker-green
# ~ stop tasks-worker-blue once its jobs finish
# Caddy serves tasks from green on 127.0.0.1:3010
# ~ switch tasks to green: 20260927T100000Z-abc1234 is live
# ✔ Deployed the release 20260927T100000Z-abc1234 of tasks to 203.0.113.10, live on green
```

Without `--artifact`, the deploy first builds an [archive](./build.md#archives) for the `arch` of the environment, like `nuxvel build --artifact --platform=linux/<arch>`. It builds only a clean git tree whose commit is pushed, so every release matches a commit that others can see. `--force` builds the tree as it is. CI builds the archive in an earlier job and passes it:

```bash
npx nuxvel deploy production --artifact=dist/tasks-1.4.0-linux-amd64.tar.gz
```

The deploy connects as the deploy user of the server (the `user` in `nuxvel.deploy.ts`), with the host key pinned in `.nuxvel/known_hosts`. When the app is not on the server yet, the deploy runs [`app:create`](#creating-the-app-on-the-server) right before it takes the lock (step 2). `app:create` connects as `root`, so run the first deploy from a machine with root's SSH key, not from [CI](#deploying-from-github-actions). A deploy:

1. Checks the archive before it connects: its `.sha256` checksum, and that its [build manifest](./build.md#build-manifest) is for Linux on the `arch` of the environment.
2. Takes the deploy lock, `deploy.lock` in the app folder, with your user, machine and time. When another deploy holds it, the deploy stops:

   ```
   ✖ tasks is being deployed by ci on runner-7 since 2026-09-27T09:00:00.000Z
     → Wait for that deploy to finish. If it stopped, run nuxvel deploy:unlock production
   ```

   When that deploy is in its [hold](#the-hold), `deploy:unlock` refuses, and the deploy says so:

   ```
   ✖ tasks is being deployed by ci on runner-7 since 2026-09-27T09:00:00.000Z, and that deploy is in its hold
     → Wait for the hold to end, or end it now with nuxvel rollback production
   ```

3. Checks the build manifest against the server: glibc, and the Node.js major version of the server. Then it checks `shared/.env` against the checks the server runs at boot. When a check fails, the deploy releases the lock and changes nothing more:

   ```
   ✖ /srv/apps/tasks/shared/.env fails the server's boot checks: NUXT_AUTH_SECRET is not set
     → Set the variables in .nuxvel/production.env (nuxvel env:pull production) and run nuxvel env:push production, nothing is deployed
   ```

4. Uploads the archive, checks its checksum again on the server, and extracts it into a new release folder, `releases/<UTC time>-<commit>/`. The release gets a `.env` link to `shared/.env`, and the root script `assets` copies its hashed assets into `/srv/nuxvel/assets/<app>/_nuxt/`. It refuses an archive with a link or a special file. The new files go next to those of the older releases, so a browser that loaded the previous release still gets its files.
5. Runs the [migrations](./build.md#release-entries) of the new release with the owner database URL of `shared/owner.env`, while the live release keeps serving. Write each migration so that the live release still works after it. When a migration fails, the deploy stops and switches nothing. A [contract migration](./database.md#contract-migrations) runs only when the live release already contains it, so no running release reads what it removes. The deploy records it in `state.json`. It lists the others as deferred:

   ```
   ▲ Deferred the contract migration 0026_posts-drop-summary: it runs once no older release runs
   ```

   The deploy ends with a warning that tells you to run `nuxvel db:contract <env>`. The next deploy runs them too. See [Contract migrations](#contract-migrations).

   The wait applies to a live database only. On a database with no applied migration, a contract migration that waits on a backfill runs at once, because its tables are empty. See [Fresh databases](./backfills.md#fresh-databases).

   A contract migration that the live release contains, but that [waits on a backfill](./database.md#contract-migrations), stays deferred too. The deploy lists it separately, and ends with a warning:

   ```
   ▲ The contract migration 0026_posts-drop-summary waits on a backfill: it runs once the backfill completed
   ▲ Contract migrations wait on a backfill
     → Run nuxvel db:contract production once the backfill completed
   ```

6. Starts the web processes of the idle color (blue on the first deploy, then the color that is not live) with the new release, from its [ecosystem file](#app-processes). It waits until `/api/health/ready` answers on their port, then requests each `deploy.smoke` path. Each must answer with a status below 500.
7. Starts the new workers and waits until each is ready, then stops the old workers, which first finish their jobs. The old web processes still serve, so the jobs they queue run on the new workers: keep a job's old payload readable with [payload versions](./queues.md#payload-versions), and a renamed job's old name with [`renamed()`](./queues.md#renaming-a-job).
8. Points the [Caddy site](#serving-the-app-with-caddy) at the new color, links `current` to the new release, and records the live color, its release and its process counts in `state.json`.
9. Holds the old color for `deploy.hold` seconds (600 by default): its web processes stay up, idle, while the deploy watches the new color. They first close their [realtime connections](./realtime.md#deploys) at random moments, so the browsers reconnect to the new color. The deploy switches back when one of these occurs:

   - `/api/health/ready` of the new color fails 3 checks in a row (one check every 2 seconds).
   - At least 10% of the requests in the last minute answer 5xx, with at least 10 requests. The hold reads them from Caddy's access log, `/var/log/caddy/<app>.access.log`.

   In a switch-back, Caddy points at the old color again, the old workers restart, the hold deletes the new processes, and `current` and `state.json` go back. The hold posts an alert to `alerts.webhook`, except when the switch-back came from [`nuxvel rollback`](#rolling-back).
10. Retires the old color after a clean hold: deletes its processes, keeps the newest `keepReleases` releases that finished their hold (and the release each color last ran), and deletes the other releases. So a release whose checks or hold failed does not stay on the server, and a rollback never picks it. The list of the releases that finished their hold is `passed` in `state.json`. When `state.json` has no `passed` list, no earlier release counts as passed. It also deletes, through the `assets` script, the hashed assets that no kept release uses and that are older than 7 days.
11. Releases the lock, also when a step fails.

When a check fails, the deploy prints the last 40 log lines of each new process, deletes the new processes, and leaves the live color serving:

```
/ answers 500 on tasks-web-green
...                       (the last log lines of tasks-web-green)
The live color keeps serving, nothing is switched
✖ The deploy failed on deploy@203.0.113.10 (exit code 1)
```

### Rolling deploys

With `deploy: { strategy: "rolling" }`, the deploy replaces the processes of the live color one at a time. It does this also when the server memory cannot hold a second color of the app: two sets of its processes, 512 MB each, next to the processes of the other apps:

```
▲ A second color of tasks does not fit in the memory of 203.0.113.10: replacing its processes one at a time
~ replace tasks-worker-blue
~ replace the processes of tasks-web-blue one at a time on 127.0.0.1:3000
  / answers 200
~ roll tasks on blue: 20260927T100000Z-abc1234 is live
```

The workers are replaced first, then each web process: pm2 starts a new one, waits until it is ready, and stops an old one, so a request always finds a process. The migrations, the checks and the [hold](#the-hold) after the switch are the same. When a check fails, the processes go back to the previous release. When the hold finds a problem, it also puts the previous release back, because there is no old color to switch to.

Each color's ecosystem file starts `/srv/apps/<app>/<color>`, a link to the release that color runs, so pm2 can replace its processes with a new release.

### The hold

The hold runs on the server, in the background, so it continues when you close the terminal or CI cancels the job. It reads its settings, which include the alert webhook, from `hold.json` in the app folder. Only the deploy user can read that file, and the settings are not in the process list. The deploy follows the output of the hold (also written to `hold.log` in the app folder) and ends with it:

```
Holding blue for 600s while green serves
~ close the realtime streams of tasks-web-blue, so its clients reconnect to green
~ retire the blue processes of tasks
~ remove the release 20260920T080000Z-5d6e7f8
Kept 5 of 6 releases
✔ Deployed the release 20260927T100000Z-abc1234 of tasks to 203.0.113.10, live on green
```

After a [rolling deploy](#rolling-deploys), the first line is `Watching <release> for 600s`, and there is no color to retire.

After a switch-back, the deploy fails:

```
▲ 20 of the last 20 requests answered 5xx on green: switching back to blue
✖ The release 20260927T100000Z-abc1234 failed after the switch, tasks is back on blue with 20260926T160000Z-9f8e7d6
  → Fix the release and deploy again
```

The alert is a JSON `POST` with `app`, `environment`, `event` (`deploy.switched-back`) and `message`. The hold sends it only for a switch-back that its checks start. A switch-back that [`nuxvel rollback`](#rolling-back) requests sends no alert. When the webhook fails, the hold prints a warning and continues. Jobs that the failed release queued can fail on the old workers: retry them with [`nuxvel queue:retry`](./cli.md) after the next deploy. With `hold: 0`, the deploy retires the old color right after the switch.

### Deploying from GitHub Actions

`nuxvel make:ci <env>` writes `.github/workflows/deploy.yml`. On each push to `main`, it:

1. Runs the tests in 3 shards.
2. Runs `nuxvel db:check`, `nuxvel route:list --diff-env=<env>` against the live release, and, when a migration changed since the live release's commit, `nuxvel test:compat` against that commit.
3. Builds the archive with `nuxvel build --artifact` on a runner of the server's `arch`.
4. After all three, runs `nuxvel deploy <env> --artifact=...` in the GitHub environment `<env>`.

The workflow reads the live release with `nuxvel release:list <env> --json`. When that command fails, for example because the server does not answer, the check job fails and the deploy does not start. When no release is live yet, the check job skips `nuxvel test:compat`.

The workflow does not run `npm run typecheck`. The `ci.yml` of the starter runs it, and it also runs on each push to `main`. So a push to `main` runs the tests two times, one time in each workflow, and the deploy does not wait for `ci.yml`. To run the typecheck before the deploy, add `- run: npm run typecheck` to the `check` job of `deploy.yml`. To run the tests only one time, remove `push` from the `on` block of `ci.yml`, so that it runs only on pull requests.

```bash
npx nuxvel make:ci production
# ✔ Created .github/workflows/deploy.yml
```

Make an SSH key for CI, and add its public key to the deploy user on the server. Do not add it to root, so CI can connect only as the deploy user. `server:setup` keeps this key when it runs again:

```bash
ssh-keygen -t ed25519 -N "" -C ci -f nuxvel-ci
ssh deploy@203.0.113.10 'cat >> ~/.ssh/authorized_keys' < nuxvel-ci.pub
```

Add the private key (`nuxvel-ci`) as the repository secret `NUXVEL_SSH_KEY`, then delete it from your machine. Commit `.nuxvel/known_hosts`, which `server:setup` writes: the workflow checks the server's host key against it.

The workflow has no `.env.deploy`, and it sets none of its variables. When `nuxvel.deploy.ts` reads a variable (see [Credentials](#credentials)), add it as a repository secret and set it in the `env` of the `check` and `deploy` jobs. Otherwise each nuxvel command of these jobs stops with `is not set, add it to .env.deploy`.

The CI key cannot log in as root. So run the first deploy of the app, which runs `app:create` as root, from your machine.

## Releases and the deploy lock

`nuxvel release:list <env>` lists the releases on the server, newest first. For each release, it shows the commit and the build source from its build manifest, and the deploy time from its name. `--json` prints them as JSON:

```bash
npx nuxvel release:list production
# RELEASE                    COMMIT   SOURCE  DEPLOYED                 COLOR
# 20260927T100000Z-abc1234   abc1234  ci      2026-09-27 10:00:00 UTC  green (live)
# 20260926T160000Z-9f8e7d6   9f8e7d6  local   2026-09-26 16:00:00 UTC  blue
```

`COLOR` comes from the release of each color in `state.json`: it names each color whose link points at the release, and `(live)` marks the live color, the color that Caddy serves. After `app:rotate-credentials`, both colors can point at the live release. Then only the color that Caddy serves has `(live)`. A deploy retires the old color but keeps its link. So a color stays in the list after its processes stop, until a deploy uses that color again. Above, blue has no processes after the hold of the green deploy.

A deploy that stops before its end, for example when its machine loses power before the hold starts, leaves its lock. `nuxvel deploy:unlock <env>` shows who holds the lock and since when, and removes it after you confirm:

```bash
npx nuxvel deploy:unlock production
# ▲ The deploy lock of tasks is held by ci on runner-7 since 2026-09-27T09:00:00.000Z, 3 hours ago
#   → If that deploy still runs, two deploys can then run their migrations at the same time
# ◇ Remove the deploy lock of tasks?
# │ Yes
# ✔ Removed the deploy lock of tasks, held by ci on runner-7 since 2026-09-27T09:00:00.000Z
```

Remove a lock only when you know that its deploy stopped. A deploy that still runs, for example a slow upload or slow migrations in CI, then runs next to the next deploy. Without a terminal, it stops and asks for `--force`, which removes the lock without asking. It removes the lock only when it is still the lock it showed.

It refuses while a deploy is in its hold, which runs on the server and releases the lock itself. End the hold with [`nuxvel rollback`](#rolling-back) instead.

## Contract migrations

A deploy runs a [contract migration](./database.md#contract-migrations) only when the live release already contains it. So the deploy that brings one defers it. Once that deploy is done, and no older release runs, apply it:

```bash
npx nuxvel db:contract production
# ~ apply the contract migration 0026_posts-drop-summary
# ✔ Applied 1 contract migration of tasks on 203.0.113.10
```

It takes the deploy lock, so it never runs during a deploy or its hold, and it refuses while the other color still runs. A contract migration that waits on a backfill stays deferred. `db:contract` names it, and tells you to run it again once the backfill completed:

```bash
npx nuxvel db:contract production
# ▲ The contract migration 0026_posts-drop-summary waits on a backfill
# ▲ 1 contract migration of tasks on 203.0.113.10 waits on a backfill
#   → Run nuxvel db:contract production again once the backfill completed
```

After `db:contract` applies a contract migration, [`nuxvel rollback`](#rolling-back) refuses a release older than the migration.

## Rolling back

`nuxvel rollback <env> [release]` puts the app back on an earlier release. It never undoes a migration, so write each migration so that the previous release still works after it. It refuses a release older than an applied contract migration, which may read what the migration removed. `--force` rolls back to it anyway.

During the hold of a deploy, `nuxvel rollback <env>` signals the hold to switch back. The hold points Caddy at the held color again, restarts its workers and deletes the new processes, as after a failed check, but it sends no alert to `alerts.webhook`:

```bash
npx nuxvel rollback production
# ▲ a rollback was requested on green: switching back to blue
# Caddy serves tasks from blue on 127.0.0.1:3000
# ▲ 0 jobs are in the failed lists of tasks. Jobs that the rolled-back release queued with a new job name or payload version fail on the old workers and land there too
#   → Run nuxvel queue:retry after the next deploy
# ✔ Rolled tasks back to the held release on 203.0.113.10
```

With a [rolling deploy](#rolling-deploys), there is no held color. The rollback points the live color back at the previous release and replaces its processes again:

```bash
npx nuxvel rollback production
# ▲ a rollback was requested on blue: switching back to 20260926T160000Z-9f8e7d6
```

When the hold ends while the rollback asks for the switch-back, the new release stays live, and the rollback continues as after the hold.

During a hold, `nuxvel rollback <env> <release>` refuses: the hold keeps the deploy lock, and `nuxvel deploy:unlock` refuses to remove it. First end the hold with `nuxvel rollback <env>`, then roll back to the release you name.

After the hold, the rollback deploys the release before the live one again, or the release you name, to the idle color, without migrations. It runs the same checks, switch and hold as a deploy:

```bash
npx nuxvel rollback production
# Rolling tasks back from 20260927T100000Z-abc1234 to 20260926T160000Z-9f8e7d6, without migrations
# ...
npx nuxvel rollback production 20260925T090000Z-1a2b3c4
```

The server keeps the newest `keepReleases` releases that finished their hold, so you can roll back to any of them. A release whose checks or hold failed stays on the server only until the next deploy finishes its hold.

## The server environment file

The app's processes read `shared/.env` on the server. `nuxvel env:pull <env>` copies it to `.nuxvel/<env>.env` (mode 600, git-ignored), and `nuxvel env:push <env>` uploads your edited copy back:

```bash
npx nuxvel env:pull production
# ✔ Wrote shared/.env of tasks on 203.0.113.10 to .nuxvel/production.env
npx nuxvel env:push production
# ~ set NUXT_MAIL_FROM
# ✔ Uploaded .nuxvel/production.env as shared/.env of tasks on 203.0.113.10
#   → Each process reads it when it starts: nuxvel deploy production starts all of them with it, and a process that pm2 restarts before then (after a crash or a reboot) also gets it
```

Before the upload, `env:push` checks the file against the same boot checks as a deploy, and uploads nothing when one fails. It also refuses while a command holds the deploy lock, such as a deploy or `db:contract`. It lists changed variables by name only, never their values.

Write each line as `KEY=value`, with no quotes around the value. The server scripts read some values (such as `NUXT_REDIS_URL` and `NUXT_AUTH_SECRET`) with `sed`, as they are, so quotes would become part of the value. `env:push` refuses a file with a quoted value.

The upload does not restart a process. Each process reads `shared/.env` only when it starts (Node's `--env-file`). The next deploy starts all processes with the new file. But pm2 also restarts a process after a crash, after it uses more than 512 MB, and after a reboot, and that process then reads the new file at once. So a pushed file can be live on some processes before the next deploy: push only a file that is correct now.

`env:pull` also writes the SHA-256 hash of the server's file to `.nuxvel/<env>.env.pulled`. `env:push` compares that hash with the server's file before the upload, and refuses when they differ: another command changed the file after your pull, such as [`app:rotate-credentials`](#rotating-credentials), and your copy would put the old values back. Pull again and make your changes again. After an upload, `env:push` writes the hash of the new file.

## Logs, status and a shell

`nuxvel logs <env>` streams the logs of the live web processes until you stop it with Ctrl-C. `--worker` streams the workers instead, and `--caddy` Caddy's JSON access log of the app. `--lines` sets how many earlier lines come first (50).

`nuxvel status <env>` shows the live release, whether it is ready, the last backup and the app's processes:

```bash
npx nuxvel status production
# tasks on 203.0.113.10
# Release  20260927T100000Z-abc1234 (green)
# Health   ready (200)
# Backup   none yet
# Off-site none
#
# PROCESS             ID  STATUS  MEMORY  RESTARTS  UPTIME
# tasks-web-green     4   online  88 MB   0         2h
# tasks-web-green     5   online  87 MB   0         2h
# tasks-worker-green  6   online  95 MB   0         2h
# ▲ production has no off-site backup target: the backups stay on 203.0.113.10, and are lost with it
#   → Set backups.offsite in nuxvel.deploy.ts and run nuxvel server:setup
```

`--json` prints the status as JSON.

`nuxvel server:status <env>` shows the whole server, as `root`. `--json` prints it as JSON:

```bash
npx nuxvel server:status production
# 203.0.113.10
# Disk     5120 of 40960 MB (13%)
# Memory   3840 MB, 2304 MB for apps, swap in use 0 MB
# Services postgres up, redis durable up, redis cache up, seaweedfs up, caddy down, pm2 up
#
# APP    RELEASE                           PROCESSES  MEMORY          BACKUP
# tasks  20260927T100000Z-abc1234 (green)  3          1536 of 2304 MB  none yet
#
# DATABASE  CALLS  MEAN    QUERY
# tasks     12     740 ms  select * from tasks where title ilike $1
# ▲ caddy is not answering
```

It lists the statements that average 500 ms or more, from `pg_stat_statements`. It also shows the last lines of the Postgres slow-query log, which logs each statement that takes 500 ms or more. It warns when:

- the processes of the apps need more memory than the apps' share (512 MB each process)
- their database pools during a deploy (both colors) do not fit the Postgres connection limit
- the disk is 80% full
- a service does not answer

`nuxvel ssh <env>` opens a shell as the deploy user in `/srv/apps/<app>/`, checking the host key pinned in `.nuxvel/known_hosts`.

`nuxvel tinker <env>` opens the [tinker REPL](./cli.md#nuxvel-tinker) of the live release on the server, with its `shared/.env` and `shared/owner.env`, after you confirm:

```bash
npx nuxvel tinker production
# ◆ Open a REPL on tasks in production (203.0.113.10)? What you run there changes its live data
# nuxvel> await useDb().select().from(taskTable).limit(5)
```

`--force` opens the REPL without the question. It runs `.output/server/nuxvel/tinker.mjs` of the release that `current` links to, which starts the server on a free port on 127.0.0.1 and opens the REPL. So it does not collide with the live colors. The server keeps no source.

`nuxvel down <env>`, `nuxvel up <env>` and `nuxvel maintenance:status <env>` run through the same `tinker.mjs`, with the command as its argument and no REPL. Both colors use the same Redis, so `down <env>` puts all of them in maintenance mode. See [Maintenance mode on a VPS](./maintenance.md#on-a-vps).

The REPL gets the same environment as the pm2 processes of the app, except the host, the port and the pool size: `NODE_ENV=production`, `NUXT_NUXVEL_SECURITY_TRUST_PROXY=loopback` and `NUXT_ERASURE_LOG_COMMAND`. So `eraseUserData()` in the REPL writes to the erasure log, as it does in the app. See [Erasures and restores](#erasures-and-restores). The REPL also gets `NUXT_DATABASE_OWNER_URL`, so `verifyAuditChain()` can read the audit log as the owner role. `useDb()` still connects as the runtime role.

## Monitoring

`server:setup` installs a monitor that runs every minute on a systemd timer (`nuxvel-monitor`), apart from the apps, so it keeps watching when an app is down. It checks:

| Alert | Severity | When |
| --- | --- | --- |
| Disk | warning, critical | the disk is 80% full, critical at 90% |
| Swap | warning | swap has been in use for 10 minutes |
| Out of memory | critical | the kernel killed a process that ran out of memory, in the last hour |
| Service down | critical | Postgres, a Redis instance, SeaweedFS or Caddy does not answer |
| Health | critical | `/api/health/ready` of an app's live color has failed for 2 minutes |
| Backup | critical | an app's newest backup is over 26 hours old (or it has no backup 26 hours after the monitor first saw it live), its off-site upload failed, or its restore drill failed |
| Restore drill | warning | with `backups.restoreDrill`, the last restore drill of an app ran over 8 days ago, or none ran in the 8 days since the setup of its timer |
| Failed jobs | warning | an app's failed jobs grew in the last 10 minutes |
| Waiting job | warning | a job has waited in a queue for over 10 minutes |
| Incompatible payload | critical | a job failed in the last hour on a payload its code cannot read (a newer payload version, or no upcaster) |
| Outbox | critical | the same outbox row has stayed unsent for over a minute |
| Backfill | warning | a backfill has made no progress for 30 minutes |
| TLS | warning | the certificate of a domain expires within 14 days |
| Switch-back | critical | the hold of a deploy switched back in the last hour after a failed check. A switch-back that [`nuxvel rollback`](#rolling-back) requested sends no alert |
| Reboot | warning | security updates have waited on a reboot for over 7 days |
| Monitor check | warning | a check of the monitor itself failed with an error |

A condition fires once, when it becomes true (after its time, for those with one). It resolves once, when it is no longer true. Each firing and resolved event goes to the [alert channels](#alerts), and is a JSON line in `/var/log/nuxvel/monitor.log`, which [log shipping](#log-shipping) sends to your sink:

```json
{"time":"2026-09-27T10:04:00.000Z","event":"firing","key":"health:tasks","severity":"critical","message":"tasks: /api/health/ready on green fails"}
```

The logs in `/var/log/nuxvel/` rotate weekly.

### Alerts

With `alerts` in `nuxvel.deploy.ts`, `server:setup` stores the channels in `/etc/nuxvel/alerts.json` (root only), and the monitor sends each alert through them:

- `email` with `smtp`: a message to the address, through the SMTP relay of the URL, from the same address. With a user and password in the URL (`smtp://user:password@smtp.example.com:587`), the relay must offer STARTTLS, or the email fails and the password is not sent. Without a user, the monitor uses STARTTLS when the relay offers it. `smtps://` always uses TLS.
- `webhook`: a JSON `POST` with `server`, `event`, `key`, `severity`, `message` and `time`. `event` is `firing`, `resolved` or `test` (from `alerts:test`, with `severity` `info`). Only a `firing` alert has `repeat`.

`alerts` is a setting of the server: the monitor watches every app on the server and sends all alerts to one set of channels. The last `server:setup` that has `alerts` sets the channels. A `server:setup` without `alerts`, for example of another app on the same server, does not change them. To stop the alerts, remove `/etc/nuxvel/alerts.json` on the server.

An alert goes out when it fires, again every hour while it keeps firing (`repeat: true`), and one time when it resolves. A channel that fails is tried again the next minute, and the failure is logged in `/var/log/nuxvel/monitor.log` (`"event":"delivery-failed"`). Check the channels with `nuxvel alerts:test <env>`:

```bash
npx nuxvel alerts:test production
# ✔ Sent the test alert through the email
# ✖ The webhook failed: curl: (22) The requested URL returned error: 404
# ✔ Sent the test alert through the heartbeat URL
```

A monitor from a nuxvel version before `alerts:test` cannot send a test alert. `alerts:test` then stops and sends nothing: run `server:setup` to update the monitor.

`heartbeat` is the URL of a dead man's switch, such as Healthchecks.io or Better Stack heartbeats. The monitor requests it every minute, so the service alerts you when the monitor stops, for example when the whole server is down.

### Metrics

The monitor also writes Prometheus metrics, which `nuxvel-metrics` serves on `http://127.0.0.1:9470/metrics`, for a Prometheus agent on the server or an SSH tunnel:

| Metric | Labels |
| --- | --- |
| `nuxvel_disk_used_percent`, `nuxvel_swap_used_megabytes` | |
| `nuxvel_service_up` | `service` |
| `nuxvel_app_ready` | `app` |
| `nuxvel_backup_age_seconds` | `app` |
| `nuxvel_queue_jobs` | `app`, `queue`, `state` (`waiting`, `active`, `delayed`, `failed`) |
| `nuxvel_db_connections`, `nuxvel_db_pool_size` | `app`: the open connections to its database, and the sum of the pools of its live processes |
| `nuxvel_alert_firing` | `key`, `severity` |

## Security updates

The server installs security updates every day by itself. `nuxvel server:upgrade <env>` installs the waiting ones now and restarts each service that still uses an old library:

```bash
npx nuxvel server:upgrade production
# ~ install the security updates of libssl3t64 openssl
# ~ restart caddy.service
# ▲ root@203.0.113.10 needs a reboot for linux-image-7.0.0-12-generic
#   → Reboot it with nuxvel server:upgrade production --reboot, the apps are down until it is back
# ✔ Upgraded root@203.0.113.10
```

It does not restart pm2: the app processes pick up a new Node.js with the next deploy. It also does not restart the services that are not safe to restart on a running server (such as `dbus` and `systemd-logind`, which `needrestart` itself skips): it names each one, and the service picks up the update with the next reboot. A restart of Postgres, Redis, SeaweedFS or Caddy stops that service for a moment, so the apps can get errors or dropped connections for a few seconds.

`--reboot` reboots the server when an update needs it. It schedules the reboot 5 seconds after its last step, so the SSH connection can close normally first. pm2 starts the apps again when the server is back.

A new Postgres major is not a security update: `server:setup` pins Postgres 18, and the server stays on it. A major upgrade (`pg_upgradecluster` on the server, after a backup) is a manual step, which waits for a nuxvel release that moves the pin.

## Backups

Each night, a timer on the server (`nuxvel-backup`, between 02:00 and 03:00 UTC) backs up every app on it. `nuxvel db:backup <env>` backs up the app now:

```bash
npx nuxvel db:backup production
# ~ dump the database tasks to /srv/nuxvel/backups/tasks/database-20260927T020312Z.dump (48.2 MB)
# ~ sync the bucket tasks-private to /srv/nuxvel/backups/tasks/buckets/tasks-private: 1204 files, 12 copied, 1 removed
# ~ sync the bucket tasks-public to /srv/nuxvel/backups/tasks/buckets/tasks-public: 31 files, 0 copied, 0 removed
# ~ write the config bundle /srv/nuxvel/backups/tasks/config-20260927T020312Z.tar.age, encrypted to the recovery key
# ~ remove the backup of 20260919T021544Z, past the retention of 7 daily, 4 weekly and 12 monthly
# ✔ Backed up tasks on 203.0.113.10 to /srv/nuxvel/backups/tasks/, as of 20260927T020312Z
```

A backup, in `/srv/nuxvel/backups/<app>/` (root only), is:

- `database-<time>.dump`: the app's database, from `pg_dump` in the custom format (restore it with `pg_restore`).
- `buckets/<bucket>/`: a copy of the files of both buckets, synced each time: new and changed files are copied, deleted ones removed.
- `config-<time>.tar.age`: the config bundle, encrypted to the [recovery key](#recovery-key): `shared/.env` and `shared/owner.env`, `state.json`, the pm2 ecosystem files, the live release as `<release>.tar.gz`, the server registry and the app's Caddy site file.

The backup of an app fails when its `state.json` names an active color other than `blue` or `green`, or an active release whose name nuxvel did not make. It then writes no config bundle, and the Backup alert fires.

The server keeps the newest backup of each of the last 7 days, 4 weeks and 12 months, and removes the others. `nuxvel status` and `nuxvel server:status` show the time of the last backup. Open a config bundle with the private recovery key:

```bash
age -d -i recovery.key config-20260927T020312Z.tar.age | tar -x
```

### Off-site backups

A backup on the server is lost with the server. With `backups.offsite` in `nuxvel.deploy.ts`, each backup is uploaded to an S3-compatible bucket elsewhere, such as Backblaze B2, Cloudflare R2 or Amazon S3:

```ts
production: {
  // ...
  backups: {
    offsite: {
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      bucket: "tasks-backups",
      accessKeyId: process.env.NUXVEL_OFFSITE_KEY_ID,
      secretAccessKey: process.env.NUXVEL_OFFSITE_SECRET,
    },
  },
},
```

`server:setup` then:

- Installs rclone.
- Checks that the credentials can list the bucket, and can write and delete a file in it (`.nuxvel-check`). When a check fails, the setup stops with the error of the bucket.
- Stores the credentials in `/etc/nuxvel/offsite.env` (root only). Each value is in single quotes, so a value in `backups.offsite` cannot contain a single quote or a line break: loading `nuxvel.deploy.ts` refuses one that does. `server:restore --from` writes the credentials of its rehearsal the same way.
- Turns on versioning of the bucket, so a file that is deleted or changed there keeps its earlier version. When the provider has no versioning, each run warns: turn on versioning or a retention lock at the provider if it offers one. The setup tries to turn on versioning again only when `backups.offsite` changes.

Each backup then uploads, under `<app>/` in the bucket:

- The database dump, encrypted to the recovery key (`database-<time>.dump.age`).
- The config bundle.
- A sync of the bucket copies (`buckets/<bucket>/`).

Dumps and bundles past the retention are deleted in the bucket too. The retention in the bucket counts the backups in the bucket, not the backups on the server. So a server with fewer backups, such as a server that `server:restore` rebuilt, does not delete the older backups in the bucket.

The folder in the bucket has the app name only. So give each environment its own bucket: two environments that name the same `endpoint` and `bucket` would overwrite the backups of each other, and `nuxvel.deploy.ts` refuses them.

`backups.offsite` is a setting of the server: the nightly backup uploads every app on the server to the one bucket in `/etc/nuxvel/offsite.env`. The last `server:setup` that has `backups.offsite` sets the bucket. A `server:setup` without `backups.offsite`, for example of another app on the same server, does not change the bucket, and does not warn. To stop the off-site upload, remove `/etc/nuxvel/offsite.env` and `/etc/nuxvel/offsite-versions-tried` on the server. The backups of every app on the server then stay on the server only.

When an upload fails, the backup fails, and the local backup stays. `nuxvel status` shows the last upload:

```
Off-site failed 2026-09-27T02:04:10.000Z: rclone rcat failed: ... 403 Forbidden
▲ The last off-site upload failed, the newest backup is only on the server
```

Without `backups.offsite`, `server:setup`, each deploy, `nuxvel status` and `nuxvel doctor` warn that the backups stay on the server. Store the off-site credentials outside the server with the recovery key: to restore a lost server, you need both.

### Restoring a backup

`nuxvel db:restore <env>` restores the newest backup of the app's database into a new database on the server, next to the live one, and checks it:

```bash
npx nuxvel db:restore production
# ~ restore /srv/nuxvel/backups/tasks/database-20260927T020312Z.dump into the new database tasks_restored_20260927t020312z
#   42 migrations applied, 42 at the backup
#   public.tasks: 1840 rows, 1840 at the backup
#   public.users: 212 rows, 212 at the backup
# ✔ Restored the backup 20260927T020312Z of tasks into the new database tasks_restored_20260927t020312z on 203.0.113.10, the live database is untouched
```

`--from=<time>` restores an earlier backup instead of the latest. `--to=<url>` restores into an existing empty database instead, such as one of a staging server. Each backup records the row count of every table. The restore fails when the migrations table is missing, or holds another number of migrations than at the backup. It also fails when a table that had rows is missing or empty. The restored database belongs to `<app>_owner`, and `<app>_app` has its data rights, so you can point `NUXT_DATABASE_URL` at it with [`env:push`](#the-server-environment-file).

With `backups.restoreDrill: true`, a weekly timer (`nuxvel-<app>-restore-drill`, Sundays after 04:00 UTC) restores the newest backup into a scratch database, checks it the same way and drops it. The result is in `/srv/nuxvel/backup-status/<app>.drill.json`, which the monitor alerts on.

### Restoring a lost server

When the server is lost, `nuxvel server:restore <env>` rebuilds it from the [off-site backups](#off-site-backups), on a new Ubuntu 26.04 server at the environment's `host`:

```bash
npx nuxvel server:restore production
# ◆  Recovery key (AGE-SECRET-KEY-1...), shown by the first server:setup
# ~ use the recovery key age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
# ...                                    (the whole server:setup)
# ~ download and decrypt the config bundle 20260927T020312Z of tasks (1.2s)
# Restoring tasks from its backup 20260927T020312Z
# ~ create /srv/apps/tasks/releases
# ~ create the database role tasks_owner, its URL in /srv/apps/tasks/shared/owner.env
# ...
# ~ restore the database tasks from the backup 20260927T020312Z (41.0s)
# ~ restore the files of the bucket tasks-private (212.4s)
# ~ restore the files of the bucket tasks-public (3.1s)
# ~ extract the release 20260927T100000Z-abc1234 of tasks (4.2s)
# ~ start tasks on green with 20260927T100000Z-abc1234 (3.0s)
# Caddy serves tasks from green on 127.0.0.1:3010
# ✔ Restored tasks on 203.0.113.10 in 6.4 min
```

It asks for the private recovery key, or reads it from `NUXVEL_RECOVERY_KEY`. It uses `backups.offsite` of `nuxvel.deploy.ts` for the bucket. The recovery key stays in `/run` (memory) during the restore, and the restore removes it at the end. Then `server:restore`:

1. Installs the recovery public key.
2. Runs `server:setup`.
3. Restores each app that it finds in the bucket, from its newest backup (or the backup of `--from=<time>`):
   - its registry entry, with the same ports
   - `shared/.env` and `shared/owner.env`
   - its database roles, Redis users and buckets, with new passwords and keys
   - its database and the files of its buckets
   - its live release, which it starts and serves through Caddy

It refuses an app that is live on the server.

Before it uses a config bundle, it checks it. It stops with an error when the bundle holds a link or a special file, or when a value is not one that nuxvel writes. The folder must be `/srv/apps/<app>`, and the database must be `<app>` with `_` for `-`. The domains and redirects must have the form that `nuxvel.deploy.ts` accepts. The ports must be whole numbers, the active color must be `blue` or `green`, and the release must be a release name. It ignores a folder in the bucket whose name is not an app name. The bundle is encrypted, but it is not signed. So anyone who has the recovery public key and can write to the bucket can put a bundle there, and a restore then starts their release and data as the deploy user. Keep the keys that can write to the bucket as safe as the recovery key.

The bucket has only one copy of the files of each bucket, and each backup syncs it again. So the files always come from the newest backup, also with `--from=<time>`: only the database, `shared/` and the release come from the backup of that time.

The bucket keeps the backups of a destroyed app (`app:destroy` does not delete them). So `server:restore` first reads the server registry in the newest config bundle of the bucket, and skips each app that is not in it:

```bash
# ~ skip oldapp: the registry of the newest backup 20260927T020312Z has no entry for it, so it was destroyed before
```

When a restore fails, fix the cause and run `server:restore` again. For an app that is not live yet, it drops the database that the earlier run restored, and restores it again into an empty database. It keeps the database, Redis and S3 credentials that this server already has in `shared/.env` and `shared/owner.env`, and takes the other settings from the backup. `/etc/nuxvel/recovery.pub` can already hold another public key than the one of the recovery key you give. Then `server:restore` stops before it changes anything. Give the recovery key of the lost server. On a new server with no backup yet, you can instead remove that file first.

A new server has a new SSH host key: remove the old line of the host from `.nuxvel/known_hosts` first. Data written after the backup is lost. Aim to be serving again within 2 hours: [rehearse the restore](#rehearsing-a-restore) to know how long it takes.

### Rehearsing a restore

`--from=<env>:<latest or time>` rehearses the restore of another environment's backup on this environment's server, next to its own app, which it never touches:

```bash
npx nuxvel server:restore staging --from=production:latest
# ~ download and decrypt the config bundle 20260927T020312Z of tasks (1.1s)
# Rehearsing the restore of tasks from its backup 20260927T020312Z of production, as tasks-rehearsal next to tasks
# ~ restore the database tasks_rehearsal from the backup 20260927T020312Z of tasks (38.2s)
# ~ restore the files of the bucket tasks-private into tasks-rehearsal-private (190.4s)
# ~ start tasks-rehearsal on 127.0.0.1:3040 without workers, so no job, mail, webhook or schedule runs, and wait until it is ready (4.1s)
# ~ drop the database tasks_rehearsal
# ✔ Rehearsed the restore of tasks from production on 203.0.113.20 in 4.2 min, and removed tasks-rehearsal
```

It asks for the recovery key of the other environment, and reads the backups of that environment with its `backups.offsite`. Then it:

1. Creates a temporary app, `<app>-rehearsal`, with its own database, ports, Redis user and buckets, and no domain.
2. Restores the backup into it, and erases again the users erased since the backup.
3. Starts its web process with the settings of the backed-up app, but with its own connections, and with outgoing mail pointed at a closed port. It starts no worker, so no job, schedule or webhook runs.
4. Removes the temporary app, without a final backup. It also does this when a step fails.

While it runs, the rehearsal puts the recovery key and a copy of the data of the other environment on this server. So rehearse only on a server that you protect as well as the production server, or on a scratch server.

It checks the config bundle as `server:restore` does, before it creates the temporary app.

The rehearsal reads the bucket with rclone on this server. `server:setup` installs rclone only for an environment with `backups.offsite`. Without rclone, the rehearsal stops with `rclone is not installed on this server: set backups.offsite for <env> and run nuxvel server:setup <env>`.

Each step prints how long it took. The nightly backup skips each app whose name ends with `-rehearsal`, so it does not back up or upload a rehearsal that runs at the same time. For this reason, `nuxvel.deploy.ts` refuses an `app` name that ends with `-rehearsal`.

After a rehearsal, the CLI records its time, the backup and each step's duration in `.nuxvel/rehearsals.json`, under the environment it restored. Commit the file: `nuxvel doctor` warns when an environment with off-site backups has no rehearsal in the last 90 days.

### Erasures and restores

A backup taken before a user was [erased](./privacy.md#erasing-a-users-data) still holds their rows. So the server logs each erasure outside the database: the processes of the app get `NUXT_ERASURE_LOG_COMMAND=sudo -n /usr/local/lib/nuxvel/erasure <app>`, and [`eraseUserData()`](./privacy.md#the-erasure-log) runs it before it erases anything. The helper appends the time and the user's ID to `/srv/nuxvel/erasures/<app>.jsonl` (root only) and, with off-site backups, uploads the record to `<bucket>/<app>/erasures/` right away. When the upload fails, the erasure fails too, and nothing is erased. The app never holds the keys of the off-site bucket.

`nuxvel db:restore` then erases again, in the restored database, each user of the log erased at or after the time of the backup. It runs `eraseUserData()` through the live release's [`tinker.mjs`](./build.md#release-entries), with the erasure log off, so they are not logged twice:

```bash
# ~ erase again 2 users erased after the backup, in the new database tasks_restored_20260927t020312z
```

When that fails, or the restore or its checks fail, the restore drops the new database and exits `1`, so no copy with the rows of erased users stays. With `--to`, it does not drop that database: empty it or drop it yourself. A release built before nuxvel had `tinker.mjs` cannot do it: deploy a newer one first.

`nuxvel server:restore` does the same for each app it restores: it downloads the app's erasure records from the off-site bucket, writes them to `/srv/nuxvel/erasures/<app>.jsonl` again, and erases again the users erased after the backup before it starts the app. When that fails, it does not start the app.

When the backup holds no live release (the app was never deployed), `server:restore` does not start the app, so it cannot erase those users again. It shows their IDs:

```bash
# ▲ The backup 20260927T020312Z of tasks holds no live release: deploy it with nuxvel deploy production
# ▲ 2 users erased after the backup are in the database again. After the deploy, open nuxvel tinker production and run await eraseUserData(id) for each of these IDs: u_81, u_97
```

Deploy the app, then open [`nuxvel tinker <env>`](#logs-status-and-a-shell) and run `await eraseUserData("<id>")` for each ID.

### Checking the recovery key

`nuxvel dr:check <env>` checks that a recovery key opens the newest config bundle of the app, on the server and off-site, before you need it:

```bash
npx nuxvel dr:check production
# ◆  Recovery key (AGE-SECRET-KEY-1...), shown by the first server:setup
# ✔ The recovery key decrypts the local config bundle 20260927T020312Z of tasks
# ✔ The recovery key decrypts the off-site config bundle 20260927T020312Z of tasks
```

It also reads the key from `NUXVEL_RECOVERY_KEY`. It fails when the key is not the server's (its public key differs from `/etc/nuxvel/recovery.pub`) or a bundle does not decrypt. With off-site backups, it also fails when it cannot read the off-site bucket, or when the bucket has no config bundle of the app. The key stays in `/run` (memory) during the check.

## Rotating credentials

`nuxvel app:rotate-credentials <env>` gives the app new database, Redis and S3 credentials, deploys its live release again with them, then revokes the old ones:

```bash
npx nuxvel app:rotate-credentials production
# ~ give the database role tasks_owner a new password, in /srv/apps/tasks/shared/owner.env
# ~ create the database role tasks_app_20260927140000 in tasks_app, its URL in /srv/apps/tasks/shared/.env
# ~ add a second password to the Redis user tasks on durable, its URL in /srv/apps/tasks/shared/.env
# ~ add a second password to the Redis user tasks on cache, its URL in /srv/apps/tasks/shared/.env
# ~ add a second S3 key to the S3 user tasks, its URL in /srv/apps/tasks/shared/.env
# Deploying 20260927T100000Z-abc1234 of tasks again with the new credentials, the old ones still work
# ...
# ~ turn off the login of the database role tasks_app
# ~ remove the old password of the Redis user tasks on durable
# ~ remove the old password of the Redis user tasks on cache
# ~ delete the old S3 key 3f9c0a1b2d4e5f607182 of the S3 user tasks
# ✔ Rotated the database, Redis and S3 credentials of tasks on 203.0.113.10
```

Until the deploy has finished its hold, the old and the new runtime credentials both work, so the old processes keep serving. Afterwards the old ones do not connect. The owner role is different: its password changes at once, and the old password stops working immediately. Only the migrations use the owner role, and the deploy reads its new URL from `owner.env`. Postgres keeps one password per role, so the app gets a new login role each time, named with the time, which has the data rights of `<app>_app`. When the deploy fails, both sets still work: run the command again. A second run keeps every password that the Redis users have and adds a new one, so the processes that still use the first password keep their connection. The revoke step at the end removes all passwords except the current one. Before the revoke step changes anything, it reads the login roles and the S3 keys of the app. When it cannot read them, or when the login or the S3 key in `shared/.env` is not among them, it stops, revokes nothing, and the command fails. Fix the cause and run the command again.

## Destroying the app

`nuxvel app:destroy <env>` removes the app and its data from the server of an environment. It connects as `root` and asks you to type the app name first:

```bash
npx nuxvel app:destroy production
# ◆  Type tasks to destroy it and its data on root@203.0.113.10
# │  tasks
# ~ delete the pm2 processes of tasks
# ~ make the final backup /srv/nuxvel/backups/tasks/final-20260927T093000Z.tar.age, encrypted to the recovery key
# ~ remove the Caddy site /etc/caddy/sites/tasks.caddy
# ~ remove the timer nuxvel-tasks-maintenance
# ~ remove the timer nuxvel-tasks-restore-drill
# ~ drop the database tasks
# ~ drop the database role tasks_app_20260927140000
# ~ drop the database role tasks_app
# ~ drop the database role tasks_owner
# ~ remove the Redis user tasks and the keys tasks:* from durable
# ~ remove the Redis user tasks and the keys tasks:* from cache
# ~ delete the bucket tasks-private and its files
# ~ delete the bucket tasks-public and its files
# ~ remove the S3 user tasks
# ~ remove /srv/apps/tasks
# ~ remove /srv/nuxvel/assets/tasks
# ~ remove the backup and restore drill status of tasks
# ~ remove the nightly backups of tasks from /srv/nuxvel/backups/tasks, except the final backups
# ~ remove tasks from the server registry /srv/nuxvel/server.json
# ✔ Removed tasks from root@203.0.113.10
```

Any other answer cancels it, and it changes nothing. Without a terminal, it cannot ask, so it stops.

It first deletes the pm2 processes, so no process writes data during the backup. Then, before it removes data, it makes a final backup in `/srv/nuxvel/backups/<app>/` (root only), encrypted to the [recovery key](#recovery-key). It holds the database dump (`database.dump`, for `pg_restore`), the files of both buckets (`buckets/`), `shared/.env` and `shared/owner.env` (`shared/`) and the app's entry of the server registry (`app.json`). When the backup cannot read a file of a bucket, the command stops before it removes data. Open it with the private recovery key:

```bash
age -d -i recovery.key final-20260927T093000Z.tar.age | tar -x
```

At the end, it removes the [nightly backups](#backups) of the app from `/srv/nuxvel/backups/<app>/`: the database dumps and the bucket copies are not encrypted. It keeps the final backups (`final-*`), and it does not touch the off-site copies. It also keeps Caddy's access log `/var/log/caddy/<app>.access.log`.

## Errors

A command that reads the file stops when the file is malformed and lists each problem with its path:

```
✖ nuxvel.deploy.ts is invalid:
✖ must list exactly one server
  → at environments.production.servers
✖ is not set, add it to .env.deploy
  → at environments.production.backups.offsite.secretAccessKey
```
