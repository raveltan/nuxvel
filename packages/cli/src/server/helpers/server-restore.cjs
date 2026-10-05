const { execFileSync, spawnSync } = require("node:child_process");
const { chownSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseEnv } = require("node:util");

const WORK = "/run/nuxvel-restore";
const KEY = join(WORK, "recovery.key");
const REGISTRY = "/srv/nuxvel/server.json";
const ERASURES = "/srv/nuxvel/erasures";
const OWN_CONNECTIONS = ["NUXT_DATABASE_URL", "NUXT_REDIS_URL", "NUXT_REDIS_CACHE_URL", "NUXT_REDIS_PREFIX", "NUXT_STORAGE_URL", "NUXT_STORAGE_BUCKET"];
const APP_NAME = /^[a-z][a-z0-9-]*$/;
const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const REDIRECT = /^(?=.)([a-z0-9-]+(\.[a-z0-9-]+)+)?(\/\S*)?$/;
const RELEASE_NAME = /^\d{8}T\d{6}Z(-[0-9a-f]{1,7})?$/;
const [step, argument, deployUser, environment] = process.argv.slice(2);
const offsite = parseEnv(readFileSync("/etc/nuxvel/offsite.env", "utf8"));
const admin = parseEnv(readFileSync("/etc/nuxvel/seaweedfs.env", "utf8"));
const env = {
  ...process.env,
  ...offsite,
  RCLONE_CONFIG_LOCAL_TYPE: "s3",
  RCLONE_CONFIG_LOCAL_PROVIDER: "SeaweedFS",
  RCLONE_CONFIG_LOCAL_ENDPOINT: "http://127.0.0.1:8333",
  RCLONE_CONFIG_LOCAL_ACCESS_KEY_ID: admin.AWS_ACCESS_KEY_ID,
  RCLONE_CONFIG_LOCAL_SECRET_ACCESS_KEY: admin.AWS_SECRET_ACCESS_KEY,
  RCLONE_CONFIG_LOCAL_FORCE_PATH_STYLE: "true",
};
const remote = `offsite:${offsite.NUXVEL_OFFSITE_BUCKET}`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { env, encoding: "utf8", cwd: "/", ...options });
  if (result.error?.code === "ENOENT" && command === "rclone") {
    throw new Error(`rclone is not installed on this server: set backups.offsite for ${environment} and run nuxvel server:setup ${environment}`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args[0]} failed: ${String(result.stderr).trim().split("\n").at(-1)}`);
  return result.stdout;
}

function shell(script, ...args) {
  return run("bash", ["-c", `set -euo pipefail; ${script}`, "bash", ...args]);
}

function timed(what, action) {
  const started = Date.now();
  action();
  console.log(`~ ${what} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

function decrypt(app, stamp) {
  const bundle = join(WORK, app);
  rmSync(bundle, { recursive: true, force: true });
  mkdirSync(bundle, { recursive: true, mode: 0o700 });
  timed(`download and decrypt the config bundle ${stamp} of ${app}`, () =>
    shell(
      'rclone cat "$1" | age -d -i "$2" | tar -x -C "$3"\nif [ -n "$(find "$3" ! -type f ! -type d)" ]; then echo "the config bundle holds a link or a special file" >&2; exit 1; fi',
      `${remote}/${app}/config-${stamp}.tar.age`,
      KEY,
      bundle,
    ),
  );
  return bundle;
}

function keepConnections(file, current) {
  const key = (line) => line.split("=")[0];
  const own = readFileSync(current, "utf8").split("\n").filter((line) => OWN_CONNECTIONS.includes(key(line)));
  const settings = readFileSync(file, "utf8").split("\n").filter((line) => line && !OWN_CONNECTIONS.includes(key(line)));
  writeFileSync(file, [...settings, ...own].map((line) => `${line}\n`).join(""));
}

function checkBundle(app, stamp, bundle, entry) {
  const text = (value, pattern) => typeof value === "string" && pattern.test(value);
  const range = (ports) => Array.isArray(ports) && ports.length === 2 && ports.every(Number.isInteger);
  const wrong = Object.entries({
    folder: entry.folder === `/srv/apps/${app}`,
    database: entry.database?.name === app.replaceAll("-", "_"),
    domains: Array.isArray(entry.domains) && entry.domains.every((domain) => text(domain, HOSTNAME)),
    redirects: Object.entries(entry.redirects ?? {}).every(([from, to]) => text(from, REDIRECT) && text(to, REDIRECT)),
    filesDomain: entry.filesDomain == null || text(entry.filesDomain, HOSTNAME),
    ports: range(entry.ports?.blue) && range(entry.ports?.green),
  })
    .filter(([, valid]) => !valid)
    .map(([name]) => name);
  if (wrong.length > 0) throw new Error(`The registry entry of ${app} in the config bundle ${stamp} has values that nuxvel does not make: ${wrong.join(", ")}`);
  const saved = existsSync(join(bundle, "state.json")) ? JSON.parse(readFileSync(join(bundle, "state.json"), "utf8")) : null;
  const color = saved?.active ?? null;
  if (color !== null && color !== "blue" && color !== "green") {
    throw new Error(`The state.json of the config bundle ${stamp} of ${app} names the active color ${JSON.stringify(color)}, which is not blue or green`);
  }
  const release = color ? (saved.releases?.[color] ?? null) : null;
  if (release !== null && (typeof release !== "string" || !RELEASE_NAME.test(release))) {
    throw new Error(`The state.json of the config bundle ${stamp} of ${app} names the active release ${JSON.stringify(release)}, which is not a release name`);
  }
}

function fetch(from) {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
  const folders = run("rclone", ["lsf", remote, "--dirs-only"]).split("\n").filter(Boolean).map((name) => name.replace(/\/$/, "")).filter((name) => APP_NAME.test(name));
  const backups = folders.map((app) => {
    const files = run("rclone", ["lsf", `${remote}/${app}`, "--files-only"]).split("\n");
    const stamps = files.map((name) => /^config-(\d{8}T\d{6}Z)\.tar\.age$/.exec(name)?.[1]).filter((stamp) => stamp && files.includes(`database-${stamp}.dump.age`)).sort();
    return { app, stamps, stamp: from === "latest" ? stamps.at(-1) : stamps.find((candidate) => candidate === from) };
  });
  const newest = backups.filter(({ stamp }) => stamp).sort((a, b) => a.stamp.localeCompare(b.stamp)).at(-1);
  if (!newest) throw new Error(`The off-site bucket ${offsite.NUXVEL_OFFSITE_BUCKET} holds no backup${from === "latest" ? "" : ` of ${from}`}`);
  const backedUp = JSON.parse(readFileSync(join(decrypt(newest.app, newest.stamp), "server.json"), "utf8")).apps ?? {};

  for (const { app, stamps, stamp } of backups) {
    if (!Object.hasOwn(backedUp, app)) {
      console.log(`~ skip ${app}: the registry of the newest backup ${newest.stamp} has no entry for it, so it was destroyed before`);
      continue;
    }
    if (!stamp) throw new Error(`${app} has no backup ${from === "latest" ? "" : `of ${from} `}in the off-site bucket, it has: ${stamps.join(", ") || "none"}`);

    const bundle = app === newest.app ? join(WORK, app) : decrypt(app, stamp);
    const entry = JSON.parse(readFileSync(join(bundle, "server.json"), "utf8")).apps?.[app];
    if (!entry) throw new Error(`The config bundle ${stamp} of ${app} has no registry entry for it`);
    checkBundle(app, stamp, bundle, entry);
    const state = registry.apps?.[app] && existsSync(join(registry.apps[app].folder, "state.json"))
      ? JSON.parse(readFileSync(join(registry.apps[app].folder, "state.json"), "utf8"))
      : null;
    if (state?.active) throw new Error(`${app} is live on this server, server:restore rebuilds a lost server`);
    const database = entry.database.name;
    if (registry.apps?.[app] && run("runuser", ["-u", "postgres", "--", "psql", "-X", "-tA", "-c", `select count(*) from pg_database where datname = '${database}'`]).trim() !== "0") {
      run("runuser", ["-u", "postgres", "--", "dropdb", "--force", database]);
      console.log(`~ drop the database ${database}: it is not live, and the backup restores into an empty database`);
    }
    for (const [other, { ports }] of Object.entries(registry.apps ?? {})) {
      const clash = other !== app && ports && [ports.blue, ports.green].some(([low, high]) => [entry.ports.blue, entry.ports.green].some(([from, to]) => from <= high && low <= to));
      if (clash) throw new Error(`The ports of ${app} are taken by ${other} on this server`);
    }

    registry.apps = { ...registry.apps, [app]: entry };
    writeFileSync(`${REGISTRY}.nuxvel-new`, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o644 });
    execFileSync("mv", [`${REGISTRY}.nuxvel-new`, REGISTRY]);
    const shared = join(entry.folder, "shared");
    execFileSync("install", ["-d", "-o", deployUser, "-g", deployUser, "-m", "750", entry.folder]);
    execFileSync("install", ["-d", "-o", deployUser, "-g", deployUser, "-m", "700", shared]);
    for (const name of readdirSync(join(bundle, "shared"))) {
      const current = join(shared, name);
      if (name === "owner.env" && existsSync(current)) continue;
      if (name === ".env" && existsSync(current)) keepConnections(join(bundle, "shared", name), current);
      execFileSync("install", ["-o", deployUser, "-g", deployUser, "-m", "600", join(bundle, "shared", name), join(shared, name)]);
    }
    writeFileSync(join(bundle, "stamp"), stamp);
    console.log(`@app ${JSON.stringify({ name: app, stamp, domains: entry.domains, redirects: entry.redirects, filesDomain: entry.filesDomain })}`);
  }
}

function fetchErasures(app) {
  const logged = run("rclone", ["lsf", `${remote}/${app}`, "--dirs-only"]).split("\n").includes("erasures/");
  const records = logged
    ? run("rclone", ["cat", `${remote}/${app}/erasures`, "--include", "*.json"]).split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  records.sort((a, b) => a.time.localeCompare(b.time));
  mkdirSync(ERASURES, { recursive: true, mode: 0o700 });
  writeFileSync(join(ERASURES, `${app}.jsonl`), records.map((record) => `${JSON.stringify(record)}\n`).join(""), { mode: 0o600 });
  return records;
}

function stampTime(stamp) {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
}

function eraseAgain(app, entry, release, stamp) {
  const since = stampTime(stamp);
  const ids = [...new Set(fetchErasures(app).filter((record) => Date.parse(record.time) >= Date.parse(since)).map((record) => record.id))];
  if (ids.length === 0) return;
  const users = `${ids.length} user${ids.length === 1 ? "" : "s"}`;
  const releaseDir = join(entry.folder, "releases", release);
  if (!existsSync(join(releaseDir, ".output", "server", "nuxvel", "tinker.mjs"))) {
    throw new Error(`${users} erased after the backup ${stamp} of ${app} cannot be erased again: its release ${release} has no .output/server/nuxvel/tinker.mjs, so ${app} is not started`);
  }
  const shared = join(entry.folder, "shared");
  const ownerUrl = parseEnv(readFileSync(join(shared, "owner.env"), "utf8")).NUXT_DATABASE_OWNER_URL;
  const home = execFileSync("getent", ["passwd", deployUser], { encoding: "utf8" }).split(":")[5];
  const statements = ids.map((id) => `await eraseUserData(${JSON.stringify(id)}); console.log("@erased " + ${JSON.stringify(id)});`);
  const started = Date.now();
  const result = spawnSync(
    "runuser",
    ["-u", deployUser, "--", "env", `HOME=${home}`, "NODE_ENV=production", "NUXT_ERASURE_LOG_COMMAND=", "node", `--env-file=${join(shared, ".env")}`, ".output/server/nuxvel/tinker.mjs"],
    { cwd: releaseDir, input: `${statements.join("\n")}\n`, encoding: "utf8", env: { ...process.env, NUXT_DATABASE_URL: ownerUrl } },
  );
  const erased = new Set(String(result.stdout).split("\n").filter((line) => line.startsWith("@erased ")).map((line) => line.slice("@erased ".length)));
  const missed = ids.filter((id) => !erased.has(id));
  if (missed.length > 0) {
    throw new Error(`Erasing again the users erased after the backup failed for ${missed.join(", ")}, so ${app} is not started: ${`${result.stderr}${result.stdout}`.trim().split("\n").at(-1)}`);
  }
  console.log(`~ erase again ${users} erased after the backup (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}

function apply(app) {
  const bundle = join(WORK, app);
  const stamp = readFileSync(join(bundle, "stamp"), "utf8");
  const entry = JSON.parse(readFileSync(REGISTRY, "utf8")).apps[app];
  const { folder } = entry;
  const owned = (path) => execFileSync("chown", ["-R", `${deployUser}:${deployUser}`, path]);

  timed(`restore the database ${entry.database.name} from the backup ${stamp}`, () =>
    shell(
      'rclone cat "$1" | age -d -i "$2" | runuser -u postgres -- pg_restore --no-owner --role="$3" --exit-on-error -d "$4"',
      `${remote}/${app}/database-${stamp}.dump.age`,
      KEY,
      entry.database.owner,
      entry.database.name,
    ),
  );
  for (const bucket of [entry.buckets.private, entry.buckets.public]) {
    timed(`restore the files of the bucket ${bucket}`, () => run("rclone", ["copy", `${remote}/${app}/buckets/${bucket}`, `local:${bucket}`]));
  }

  const saved = existsSync(join(bundle, "state.json")) ? JSON.parse(readFileSync(join(bundle, "state.json"), "utf8")) : null;
  const color = saved?.active;
  const release = color ? saved.releases[color] : null;
  if (!release || !existsSync(join(bundle, `${release}.tar.gz`))) {
    const ids = [...new Set(fetchErasures(app).filter((record) => Date.parse(record.time) >= Date.parse(stampTime(stamp))).map((record) => record.id))];
    console.log(`! The backup ${stamp} of ${app} holds no live release: deploy it with nuxvel deploy ${environment}`);
    if (ids.length > 0) {
      console.log(
        `! ${ids.length} users erased after the backup are in the database again. After the deploy, open nuxvel tinker ${environment} and run await eraseUserData(id) for each of these IDs: ${ids.join(", ")}`,
      );
    }
    return;
  }
  timed(`extract the release ${release} of ${app}`, () => {
    execFileSync("tar", ["-xzf", join(bundle, `${release}.tar.gz`), "-C", join(folder, "releases")]);
    owned(join(folder, "releases", release));
    const assets = join(folder, "releases", release, ".output", "public", "_nuxt");
    if (existsSync(assets)) shell('runuser -u "$1" -- tar -C "$2" -c . | /usr/local/lib/nuxvel/assets "$3" add', deployUser, assets, app);
  });
  eraseAgain(app, entry, release, stamp);
  const other = color === "blue" ? "green" : "blue";
  const state = {
    ...saved,
    releases: { [color]: release, [other]: null },
    processes: saved.processes?.[color] ? { [color]: saved.processes[color] } : {},
  };
  writeFileSync(join(bundle, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  for (const name of ["state.json", `ecosystem.${color}.config.cjs`]) {
    execFileSync("install", ["-o", deployUser, "-g", deployUser, "-m", "600", join(bundle, name), join(folder, name)]);
  }
  for (const link of [color, "current"]) {
    rmSync(join(folder, link), { force: true });
    symlinkSync(join("releases", release), join(folder, link));
  }
  execFileSync("chown", ["-h", `${deployUser}:${deployUser}`, join(folder, color), join(folder, "current")]);

  timed(`start ${app} on ${color} with ${release}`, () => {
    const home = `HOME=${execFileSync("getent", ["passwd", deployUser], { encoding: "utf8" }).split(":")[5]}`;
    run("runuser", ["-u", deployUser, "--", "env", "-i", `PATH=${process.env.PATH}`, home, "pm2", "start", join(folder, `ecosystem.${color}.config.cjs`)], { cwd: folder });
    run("runuser", ["-u", deployUser, "--", "env", "-i", `PATH=${process.env.PATH}`, home, "pm2", "save"], { cwd: folder });
    shell(
      'for attempt in $(seq 1 60); do curl -fs -o /dev/null "http://127.0.0.1:$1/api/health/ready" && exit 0; sleep 0.5; done; echo "not ready on port $1" >&2; exit 1',
      String(entry.ports[color][0]),
    );
  });
  process.stdout.write(run("/usr/local/lib/nuxvel/caddy-site", [app, color]));
}

try {
  if (step === "fetch") fetch(argument);
  else if (step === "apply") apply(argument);
  else throw new Error("Usage: server-restore fetch <from> <user> | apply <app> <user> <env>");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
