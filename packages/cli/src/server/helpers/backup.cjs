#!/usr/bin/node
const { execFileSync, spawnSync } = require("node:child_process");
const { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } = require("node:fs");
const { dirname, join, normalize } = require("node:path");
const { parseEnv } = require("node:util");

const ROOT = "/srv/nuxvel/backups";
const STATUS = "/srv/nuxvel/backup-status";
const FILER = "http://127.0.0.1:8888";
const RECOVERY_KEY = "/etc/nuxvel/recovery.pub";
const RETENTION = { days: 7, weeks: 4, months: 12 };
const RELEASE_NAME = /^\d{8}T\d{6}Z(-[0-9a-f]{1,7})?$/;
const OFFSITE_ENV = "/etc/nuxvel/offsite.env";
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

const registry = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8"));
const apps = registry.apps ?? {};
const requested = process.argv[2];
if (requested !== undefined && !Object.hasOwn(apps, requested)) {
  console.error("Usage: backup [app], for an app in /srv/nuxvel/server.json");
  process.exit(2);
}
if (!existsSync(RECOVERY_KEY)) {
  console.error(`The server has no recovery key to encrypt the config bundle, ${RECOVERY_KEY} is missing`);
  console.error("Run nuxvel server:setup first");
  process.exit(1);
}

function megabytes(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isoWeek(stamp) {
  const date = new Date(Date.UTC(Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8))));
  const thursday = new Date(date.getTime() + (3 - ((date.getUTCDay() + 6) % 7)) * 86400000);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / 86400000 / 7 - (3 - ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-${week}`;
}

function keptStamps(stamps) {
  const newestFirst = [...stamps].sort().reverse();
  const kept = new Set();
  for (const [count, period] of [
    [RETENTION.days, (stamp) => stamp.slice(0, 8)],
    [RETENTION.weeks, isoWeek],
    [RETENTION.months, (stamp) => stamp.slice(0, 6)],
  ]) {
    const periods = new Set();
    for (const stamp of newestFirst) {
      if (periods.has(period(stamp))) continue;
      if (periods.size === count) break;
      periods.add(period(stamp));
      kept.add(stamp);
    }
  }
  return kept;
}

async function listBucket(path, files) {
  let last = "";
  for (;;) {
    const response = await fetch(`${FILER}${encodePath(path)}/?limit=1000&lastFileName=${encodeURIComponent(last)}`, {
      headers: { accept: "application/json" },
    });
    if (response.status === 404) return files;
    if (!response.ok) throw new Error(`The SeaweedFS filer answered ${response.status} for ${path}`);
    const listing = await response.json();
    for (const entry of listing.Entries ?? []) {
      // The filer keeps an entry named "." or ".." made through its gRPC API
      if (normalize(entry.FullPath) !== entry.FullPath || dirname(entry.FullPath) !== path) continue;
      if (Math.floor(entry.Mode / 2 ** 31) % 2 === 1) await listBucket(entry.FullPath, files);
      else files.push(entry);
    }
    if (!listing.ShouldDisplayLoadMore) return files;
    last = listing.LastFileName;
  }
}

function localFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

async function syncBucket(bucket, target) {
  const root = `/buckets/${bucket}`;
  const entries = await listBucket(root, []);
  const wanted = new Set();
  let copied = 0;
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const entry of entries) {
    const file = join(target, entry.FullPath.slice(root.length));
    const mtime = new Date(entry.Mtime);
    wanted.add(file);
    if (existsSync(file)) {
      const stat = statSync(file);
      if (stat.size === entry.FileSize && stat.mtime.getTime() === mtime.getTime()) continue;
    }
    const response = await fetch(`${FILER}${encodePath(entry.FullPath)}`);
    if (!response.ok) throw new Error(`The SeaweedFS filer answered ${response.status} for ${entry.FullPath}`);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    utimesSync(file, mtime, mtime);
    copied += 1;
  }
  const removed = localFiles(target).filter((file) => !wanted.has(file));
  for (const file of removed) rmSync(file);
  return { files: wanted.size, copied, removed: removed.length };
}

function dumpDatabase(database, file) {
  const partial = `${file}.partial`;
  const fd = openSync(partial, "w", 0o600);
  const dump = spawnSync("runuser", ["-u", "postgres", "--", "pg_dump", "-Fc", database], { cwd: "/", stdio: ["ignore", fd, "pipe"] });
  closeSync(fd);
  if (dump.status !== 0) {
    rmSync(partial, { force: true });
    throw new Error(`pg_dump of ${database} failed: ${String(dump.stderr).trim()}`);
  }
  execFileSync("mv", [partial, file]);
}

const COUNTS_QUERY = `select coalesce(json_object_agg(table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint), '{}') from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')`;

function rowCounts(entry) {
  const password = decodeURIComponent(new URL(parseEnv(readFileSync(join(entry.folder, "shared", "owner.env"), "utf8")).NUXT_DATABASE_OWNER_URL).password);
  const conninfo = `host=127.0.0.1 port=5432 sslmode=disable dbname=${entry.database.name} user=${entry.database.owner}`;
  const result = spawnSync("psql", ["-X", "-tA", "-v", "ON_ERROR_STOP=1", conninfo, "-c", COUNTS_QUERY], { cwd: "/", encoding: "utf8", env: { PATH: process.env.PATH, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`the row counts of ${entry.database.name} failed: ${result.stderr.trim()}`);
  return JSON.parse(result.stdout);
}

function configBundle(app, entry, file) {
  const stage = mkdtempSync("/tmp/nuxvel-backup-");
  try {
    const shared = join(entry.folder, "shared");
    mkdirSync(join(stage, "shared"));
    for (const name of existsSync(shared) ? readdirSync(shared, { withFileTypes: true }) : []) {
      if (name.isFile()) execFileSync("cp", ["-a", join(shared, name.name), join(stage, "shared")]);
    }
    const stateFile = join(entry.folder, "state.json");
    const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : null;
    if (state) execFileSync("cp", ["-a", stateFile, join(stage, "state.json")]);
    execFileSync("cp", ["/srv/nuxvel/server.json", join(stage, "server.json")]);
    for (const name of readdirSync(entry.folder).filter((file) => /^ecosystem\.(blue|green)\.config\.cjs$/.test(file))) {
      execFileSync("cp", ["-a", join(entry.folder, name), join(stage, name)]);
    }
    const site = `/etc/caddy/sites/${app}.caddy`;
    if (existsSync(site)) execFileSync("cp", [site, join(stage, `${app}.caddy`)]);
    const color = state?.active ?? null;
    if (color !== null && color !== "blue" && color !== "green") {
      throw new Error(`${stateFile} names the active color ${JSON.stringify(color)}, which is not blue or green`);
    }
    const release = color ? (state.releases?.[color] ?? null) : null;
    if (release !== null && (typeof release !== "string" || !RELEASE_NAME.test(release))) {
      throw new Error(`${stateFile} names the active release ${JSON.stringify(release)}, which is not a release name`);
    }
    if (release && existsSync(join(entry.folder, "releases", release))) {
      execFileSync("tar", ["-C", join(entry.folder, "releases"), "-czf", join(stage, `${release}.tar.gz`), "--", release]);
    }
    execFileSync("bash", ["-c", 'set -o pipefail; tar -C "$1" -c . | age -R "$2" -o "$3.partial" && chmod 600 "$3.partial" && mv "$3.partial" "$3"', "bash", stage, RECOVERY_KEY, file]);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

function prune(folder) {
  const pattern = /^(database|config)-(\d{8}T\d{6}Z)\.(dump|json|tar\.age)$/;
  const files = readdirSync(folder).filter((name) => pattern.test(name));
  const kept = keptStamps(new Set(files.map((name) => pattern.exec(name)[2])));
  const removed = new Set();
  for (const name of files) {
    const stamp = pattern.exec(name)[2];
    if (kept.has(stamp)) continue;
    rmSync(join(folder, name));
    removed.add(stamp);
  }
  for (const stamp of [...removed].sort()) console.log(`~ remove the backup of ${stamp}, past the retention of 7 daily, 4 weekly and 12 monthly`);
}

function rclone(env, args) {
  const result = spawnSync("rclone", args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`rclone ${args[0]} failed: ${String(result.stderr).trim().split("\n").at(-1)}`);
  return String(result.stdout);
}

function uploadOffsite(app, folder, stamp) {
  const env = parseEnv(readFileSync(OFFSITE_ENV, "utf8"));
  const remote = `offsite:${env.NUXVEL_OFFSITE_BUCKET}/${app}`;
  const encrypted = spawnSync(
    "bash",
    ["-c", 'set -o pipefail; age -R "$1" "$2" | rclone rcat "$3"', "bash", RECOVERY_KEY, join(folder, `database-${stamp}.dump`), `${remote}/database-${stamp}.dump.age`],
    { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "pipe"] },
  );
  if (encrypted.status !== 0) throw new Error(`rclone rcat failed: ${String(encrypted.stderr).trim().split("\n").at(-1)}`);
  rclone(env, ["copyto", join(folder, `config-${stamp}.tar.age`), `${remote}/config-${stamp}.tar.age`]);
  rclone(env, ["copyto", join(folder, `database-${stamp}.json`), `${remote}/database-${stamp}.json`]);
  for (const bucket of readdirSync(join(folder, "buckets"))) {
    rclone(env, ["sync", join(folder, "buckets", bucket), `${remote}/buckets/${bucket}`]);
  }
  const pattern = /^(database|config)-(\d{8}T\d{6}Z)\./;
  const names = rclone(env, ["lsf", remote, "--files-only"]).split("\n").filter((name) => pattern.test(name));
  const kept = keptStamps(new Set(names.map((name) => pattern.exec(name)[2])));
  for (const name of names) {
    if (!kept.has(pattern.exec(name)[2])) rclone(env, ["deletefile", `${remote}/${name}`]);
  }
  console.log(`~ upload the backup to ${remote}, with the database dump encrypted to the recovery key`);
}

async function backup(app) {
  const entry = apps[app];
  const folder = join(ROOT, app);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  mkdirSync(ROOT, { recursive: true, mode: 0o700 });
  mkdirSync(folder, { recursive: true, mode: 0o700 });

  const databaseFile = join(folder, `database-${stamp}.dump`);
  dumpDatabase(entry.database.name, databaseFile);
  const bytes = statSync(databaseFile).size;
  writeFileSync(join(folder, `database-${stamp}.json`), `${JSON.stringify({ counts: rowCounts(entry) }, null, 2)}\n`, { mode: 0o600 });
  console.log(`~ dump the database ${entry.database.name} to ${databaseFile} (${megabytes(bytes)})`);

  const buckets = {};
  for (const bucket of [entry.buckets.private, entry.buckets.public]) {
    const synced = await syncBucket(bucket, join(folder, "buckets", bucket));
    buckets[bucket] = synced.files;
    console.log(`~ sync the bucket ${bucket} to ${join(folder, "buckets", bucket)}: ${synced.files} files, ${synced.copied} copied, ${synced.removed} removed`);
  }

  const configFile = join(folder, `config-${stamp}.tar.age`);
  configBundle(app, entry, configFile);
  console.log(`~ write the config bundle ${configFile}, encrypted to the recovery key`);

  prune(folder);
  const record = { time: new Date().toISOString(), stamp, database: { file: databaseFile, bytes }, config: configFile, buckets, offsite: null };
  if (existsSync(OFFSITE_ENV)) {
    try {
      uploadOffsite(app, folder, stamp);
      record.offsite = { ok: true, time: new Date().toISOString() };
    } catch (error) {
      record.offsite = { ok: false, time: new Date().toISOString(), error: error.message };
    }
  }
  mkdirSync(STATUS, { recursive: true, mode: 0o755 });
  writeFileSync(join(STATUS, `${app}.json.partial`), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o644 });
  execFileSync("mv", [join(STATUS, `${app}.json.partial`), join(STATUS, `${app}.json`)]);
  console.log(`@backup ${JSON.stringify({ app, ...record })}`);
  if (record.offsite?.ok === false) throw new Error(`the off-site upload failed, the backup stays on this server: ${record.offsite.error}`);
}

(async () => {
  let failed = false;
  for (const app of requested ? [requested] : Object.keys(apps).filter((name) => !name.endsWith("-rehearsal"))) {
    try {
      await backup(app);
    } catch (error) {
      failed = true;
      console.error(`The backup of ${app} failed: ${error.message}`);
    }
  }
  process.exit(failed ? 1 : 0);
})();
