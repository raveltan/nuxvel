#!/usr/bin/node
const { execFileSync, spawnSync } = require("node:child_process");
const { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseEnv } = require("node:util");

const ROOT = "/srv/nuxvel/backups";
const ERASURES = "/srv/nuxvel/erasures";
const STATUS = "/srv/nuxvel/backup-status";
const MIGRATIONS = "drizzle.__drizzle_migrations";
const COUNTS_QUERY = `select coalesce(json_object_agg(table_schema || '.' || table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint), '{}') from information_schema.tables where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')`;

const usage = "Usage: [NUXVEL_RESTORE_TO=<url>] restore <app> [--from=latest|<time>] [--drill], for an app in /srv/nuxvel/server.json";
const [app, ...flags] = process.argv.slice(2);
const options = Object.fromEntries(flags.map((flag) => /^--(from)=(.+)$/.exec(flag)?.slice(1) ?? [flag.replace(/^--/, ""), true]));
options.to = process.env.NUXVEL_RESTORE_TO || undefined;
const apps = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8")).apps ?? {};
if (!app || !Object.hasOwn(apps, app) || Object.keys(options).some((name) => !["from", "to", "drill"].includes(name)) || (options.drill && options.to)) {
  console.error(usage);
  process.exit(2);
}
const { database, folder: appFolder } = apps[app];
const folder = join(ROOT, app);

function stamps() {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((name) => /^database-(\d{8}T\d{6}Z)\.dump$/.exec(name)?.[1])
    .filter(Boolean)
    .sort();
}

function postgres(args, stdin = "ignore") {
  const result = spawnSync("runuser", ["-u", "postgres", "--", ...args], { cwd: "/", encoding: "utf8", stdio: [stdin, "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `${args[0]} failed`);
  return result.stdout;
}

function withoutPassword(url) {
  const parsed = new URL(url);
  const env = parsed.password ? { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) } : process.env;
  parsed.password = "";
  return { url: parsed.toString(), env };
}

function query(target, sql) {
  const { url, env } = target.url
    ? withoutPassword(target.url)
    : { url: `host=127.0.0.1 port=5432 sslmode=disable dbname=${target.name} user=${database.owner}`, env: { PATH: process.env.PATH, PGPASSWORD: ownerPassword() } };
  const result = spawnSync("psql", ["-X", "-tA", "-v", "ON_ERROR_STOP=1", url, "-c", sql], { encoding: "utf8", env });
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim();
}

function restore(dump, target) {
  if (target.url) {
    const { url, env } = withoutPassword(target.url);
    const result = spawnSync("pg_restore", ["--no-owner", "--exit-on-error", "-d", url, dump], { encoding: "utf8", env });
    if (result.status !== 0) throw new Error(`pg_restore failed: ${result.stderr.trim()}`);
    return;
  }
  postgres(["createdb", "-O", database.owner, target.name]);
  const input = openSync(dump, "r");
  try {
    postgres(["pg_restore", "--no-owner", `--role=${database.owner}`, "--exit-on-error", "-d", target.name], input);
  } finally {
    closeSync(input);
  }
}

function check(target, recorded) {
  const problems = [];
  const hasMigrations = query(target, `select to_regclass('${MIGRATIONS}') is not null`) === "t";
  const migrations = hasMigrations ? Number(query(target, `select count(*) from ${MIGRATIONS}`)) : 0;
  const expected = recorded?.counts?.[MIGRATIONS];
  if (!hasMigrations) problems.push(`the migrations table ${MIGRATIONS} is missing`);
  else if (expected !== undefined && migrations !== expected) problems.push(`${MIGRATIONS} has ${migrations} migrations, the backup had ${expected}`);
  else if (migrations === 0) problems.push(`${MIGRATIONS} has no migration`);
  console.log(`  ${migrations} migrations applied${expected !== undefined ? `, ${expected} at the backup` : ""}`);

  const counts = JSON.parse(query(target, COUNTS_QUERY));
  for (const [table, count] of Object.entries(recorded?.counts ?? counts)) {
    if (table === MIGRATIONS) continue;
    const restored = counts[table];
    console.log(`  ${table}: ${restored ?? "missing"} rows${recorded ? `, ${count} at the backup` : ""}`);
    if (restored === undefined) problems.push(`the table ${table} is missing`);
    else if (count > 0 && restored === 0) problems.push(`the table ${table} is empty, it had ${count} rows`);
  }
  return problems;
}

function stampTime(stamp) {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
}

function erasedSince(stamp) {
  const log = join(ERASURES, `${app}.jsonl`);
  if (!existsSync(log)) return [];
  const since = stampTime(stamp);
  const records = readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return [...new Set(records.filter((record) => Date.parse(record.time) >= Date.parse(since)).map((record) => record.id))];
}

function ownerPassword() {
  return decodeURIComponent(new URL(parseEnv(readFileSync(join(appFolder, "shared", "owner.env"), "utf8")).NUXT_DATABASE_OWNER_URL).password);
}

function databaseUrl(target) {
  if (target.url) return target.url;
  return `postgres://${database.owner}:${encodeURIComponent(ownerPassword())}@127.0.0.1:5432/${target.name}`;
}

function eraseAgain(target, stamp) {
  const ids = erasedSince(stamp);
  if (ids.length === 0) return [];
  const users = `${ids.length} user${ids.length === 1 ? "" : "s"}`;
  const state = JSON.parse(readFileSync(join(appFolder, "state.json"), "utf8"));
  const release = state.active ? state.releases[state.active] : null;
  const releaseDir = release ? join(appFolder, "releases", release) : null;
  if (!releaseDir || !existsSync(join(releaseDir, ".output", "server", "nuxvel", "tinker.mjs"))) {
    return [`${users} erased after the backup cannot be erased again: the live release has no .output/server/nuxvel/tinker.mjs. Deploy a release built with this nuxvel, then restore again`];
  }
  const user = execFileSync("stat", ["-c", "%U", appFolder], { encoding: "utf8" }).trim();
  const home = execFileSync("getent", ["passwd", user], { encoding: "utf8" }).split(":")[5];
  const statements = ids.map((id) => `await eraseUserData(${JSON.stringify(id)}); console.log("@erased " + ${JSON.stringify(id)});`);
  const result = spawnSync(
    "runuser",
    ["-u", user, "--", "env", `HOME=${home}`, "NODE_ENV=production", "NUXT_ERASURE_LOG_COMMAND=", "node", `--env-file=${join(appFolder, "shared", ".env")}`, ".output/server/nuxvel/tinker.mjs"],
    { cwd: releaseDir, input: `${statements.join("\n")}\n`, encoding: "utf8", env: { ...process.env, NUXT_DATABASE_URL: databaseUrl(target) } },
  );
  const erased = new Set(result.stdout.split("\n").filter((line) => line.startsWith("@erased ")).map((line) => line.slice("@erased ".length)));
  const missed = ids.filter((id) => !erased.has(id));
  if (missed.length > 0) {
    return [`erasing again the users erased after the backup failed for ${missed.join(", ")}: ${`${result.stderr}${result.stdout}`.trim().split("\n").at(-1)}`];
  }
  console.log(`~ erase again ${users} erased after the backup, in ${target.label}`);
  return [];
}

function recordDrill(result) {
  mkdirSync(STATUS, { recursive: true, mode: 0o755 });
  writeFileSync(join(STATUS, `${app}.drill.json.partial`), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o644 });
  execFileSync("mv", [join(STATUS, `${app}.drill.json.partial`), join(STATUS, `${app}.drill.json`)]);
}

const available = stamps();
const from = options.from === undefined || options.from === "latest" ? available.at(-1) : options.from;
if (!from || !available.includes(from)) {
  console.error(
    available.length === 0
      ? `${app} has no backup in ${folder}, make one with nuxvel db:backup`
      : `${app} has no backup of ${options.from}, pick one of: latest, ${available.join(", ")}`,
  );
  process.exit(1);
}
const dump = join(folder, `database-${from}.dump`);
const countsFile = join(folder, `database-${from}.json`);
const recorded = existsSync(countsFile) ? JSON.parse(readFileSync(countsFile, "utf8")) : null;
const target = options.to
  ? { url: options.to, label: "the database of --to" }
  : { name: `${database.name}_${options.drill ? "drill" : `restored_${from.toLowerCase()}`}` };
target.label ??= `the new database ${target.name}`;

if (target.name && query({ name: "postgres" }, `select count(*) from pg_database where datname = '${target.name}'`) !== "0") {
  if (!options.drill) {
    console.error(`The database ${target.name} already exists: it holds an earlier restore of ${from}. Drop it first, or restore with --to`);
    process.exit(1);
  }
  postgres(["dropdb", "--force", target.name]);
}

let problems;
try {
  restore(dump, target);
  console.log(`~ restore ${dump} into ${target.label}`);
  problems = check(target, recorded);
  if (problems.length === 0 && !options.drill) problems = eraseAgain(target, from);
} catch (error) {
  problems = [error.message];
} finally {
  if (target.name && (options.drill || problems.length > 0)) spawnSync("runuser", ["-u", "postgres", "--", "dropdb", "--if-exists", "--force", target.name], { cwd: "/" });
}

if (options.drill) recordDrill({ time: new Date().toISOString(), from, ok: problems.length === 0, problems });
for (const problem of problems) console.error(`The restored database fails its check: ${problem}`);
if (problems.length > 0 && !options.drill) {
  console.error(
    target.name
      ? `The restore dropped the new database ${target.name}, so no copy with the rows of erased users stays`
      : "The database of --to can hold a part of the backup and the rows of users erased after it: empty it or drop it",
  );
}
console.log(`@restore ${JSON.stringify({ app, from, target: target.name ?? null, ok: problems.length === 0 })}`);
process.exit(problems.length === 0 ? 0 : 1);
