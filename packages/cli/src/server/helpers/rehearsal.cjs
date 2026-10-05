const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseEnv } = require("node:util");

const WORK = "/run/nuxvel-rehearsal";
const KEY = join(WORK, "recovery.key");
const BUNDLE = join(WORK, "bundle");
const REGISTRY = "/srv/nuxvel/server.json";
const OWN_CONNECTIONS = ["NUXT_DATABASE_URL", "NUXT_REDIS_URL", "NUXT_REDIS_CACHE_URL", "NUXT_REDIS_PREFIX", "NUXT_STORAGE_URL", "NUXT_STORAGE_BUCKET"];
const RELEASE_NAME = /^\d{8}T\d{6}Z(-[0-9a-f]{1,7})?$/;
const [step, app, argument, environment] = process.argv.slice(2);
const rehearsal = `${app}-rehearsal`;
const source = parseEnv(readFileSync(join(WORK, "offsite.env"), "utf8"));
const admin = parseEnv(readFileSync("/etc/nuxvel/seaweedfs.env", "utf8"));
const env = {
  ...process.env,
  ...source,
  RCLONE_CONFIG_LOCAL_TYPE: "s3",
  RCLONE_CONFIG_LOCAL_PROVIDER: "SeaweedFS",
  RCLONE_CONFIG_LOCAL_ENDPOINT: "http://127.0.0.1:8333",
  RCLONE_CONFIG_LOCAL_ACCESS_KEY_ID: admin.AWS_ACCESS_KEY_ID,
  RCLONE_CONFIG_LOCAL_SECRET_ACCESS_KEY: admin.AWS_SECRET_ACCESS_KEY,
  RCLONE_CONFIG_LOCAL_FORCE_PATH_STYLE: "true",
};
const remote = `offsite:${source.NUXVEL_OFFSITE_BUCKET}/${app}`;

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
  const result = action();
  const seconds = (Date.now() - started) / 1000;
  console.log(`~ ${what} (${seconds.toFixed(1)}s)`);
  console.log(`@step ${JSON.stringify({ what, seconds })}`);
  return result;
}

function envFile(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

function stampTime(stamp) {
  return `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
}

function fetch(from) {
  const files = run("rclone", ["lsf", remote, "--files-only"]).split("\n");
  const stamps = files.map((name) => /^config-(\d{8}T\d{6}Z)\.tar\.age$/.exec(name)?.[1]).filter((stamp) => stamp && files.includes(`database-${stamp}.dump.age`)).sort();
  const stamp = from === "latest" ? stamps.at(-1) : stamps.find((candidate) => candidate === from);
  if (!stamp) throw new Error(`${app} has no backup ${from === "latest" ? "" : `of ${from} `}in the off-site bucket ${source.NUXVEL_OFFSITE_BUCKET}, it has: ${stamps.join(", ") || "none"}`);

  rmSync(BUNDLE, { recursive: true, force: true });
  mkdirSync(BUNDLE, { recursive: true, mode: 0o700 });
  timed(`download and decrypt the config bundle ${stamp} of ${app}`, () =>
    shell(
      'rclone cat "$1" | age -d -i "$2" | tar -x -C "$3"\nif [ -n "$(find "$3" ! -type f ! -type d)" ]; then echo "the config bundle holds a link or a special file" >&2; exit 1; fi',
      `${remote}/config-${stamp}.tar.age`,
      KEY,
      BUNDLE,
    ),
  );
  const saved = existsSync(join(BUNDLE, "state.json")) ? JSON.parse(readFileSync(join(BUNDLE, "state.json"), "utf8")) : null;
  const color = saved?.active ?? null;
  if (color !== null && color !== "blue" && color !== "green") {
    throw new Error(`The state.json of the config bundle ${stamp} of ${app} names the active color ${JSON.stringify(color)}, which is not blue or green`);
  }
  const release = color ? (saved.releases?.[color] ?? null) : null;
  if (release !== null && (typeof release !== "string" || !RELEASE_NAME.test(release))) {
    throw new Error(`The state.json of the config bundle ${stamp} of ${app} names the active release ${JSON.stringify(release)}, which is not a release name`);
  }
  writeFileSync(join(BUNDLE, "stamp"), stamp);
  console.log(`@stamp ${stamp}`);
}

function erasedSince(stamp) {
  const logged = run("rclone", ["lsf", remote, "--dirs-only"]).split("\n").includes("erasures/");
  if (!logged) return [];
  const records = run("rclone", ["cat", `${remote}/erasures`, "--include", "*.json"]).split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return [...new Set(records.filter((record) => Date.parse(record.time) >= Date.parse(stampTime(stamp))).map((record) => record.id))];
}

function eraseAgain(entry, releaseDir, deployUser, stamp) {
  const ids = erasedSince(stamp);
  if (ids.length === 0) return;
  if (!existsSync(join(releaseDir, ".output", "server", "nuxvel", "tinker.mjs"))) {
    throw new Error(`${ids.length} users erased after the backup cannot be erased again: the release has no .output/server/nuxvel/tinker.mjs`);
  }
  const shared = join(entry.folder, "shared");
  const ownerUrl = envFile(join(shared, "owner.env")).NUXT_DATABASE_OWNER_URL;
  const home = execFileSync("getent", ["passwd", deployUser], { encoding: "utf8" }).split(":")[5];
  const statements = ids.map((id) => `await eraseUserData(${JSON.stringify(id)}); console.log("@erased " + ${JSON.stringify(id)});`);
  timed(`erase again ${ids.length} user${ids.length === 1 ? "" : "s"} erased after the backup`, () => {
    const result = spawnSync(
      "runuser",
      ["-u", deployUser, "--", "env", `HOME=${home}`, "NODE_ENV=production", "NUXT_ERASURE_LOG_COMMAND=", "node", `--env-file=${join(shared, ".env")}`, ".output/server/nuxvel/tinker.mjs"],
      { cwd: releaseDir, input: `${statements.join("\n")}\n`, encoding: "utf8", env: { ...process.env, NUXT_DATABASE_URL: ownerUrl } },
    );
    const erased = new Set(String(result.stdout).split("\n").filter((line) => line.startsWith("@erased ")).map((line) => line.slice("@erased ".length)));
    const missed = ids.filter((id) => !erased.has(id));
    if (missed.length > 0) throw new Error(`Erasing again failed for ${missed.join(", ")}: ${`${result.stderr}${result.stdout}`.trim().split("\n").at(-1)}`);
  });
}

function apply(deployUser) {
  const stamp = readFileSync(join(BUNDLE, "stamp"), "utf8");
  const entry = JSON.parse(readFileSync(REGISTRY, "utf8")).apps?.[rehearsal];
  if (!entry) throw new Error(`${rehearsal} is not in ${REGISTRY}`);
  const live = JSON.parse(readFileSync(join(BUNDLE, "server.json"), "utf8")).apps?.[app];
  if (!live) throw new Error(`The config bundle ${stamp} of ${app} has no registry entry for it`);
  const owned = (path) => execFileSync("chown", ["-R", `${deployUser}:${deployUser}`, path]);

  timed(`restore the database ${entry.database.name} from the backup ${stamp} of ${app}`, () =>
    shell(
      'rclone cat "$1" | age -d -i "$2" | runuser -u postgres -- pg_restore --no-owner --no-acl --role="$3" --exit-on-error -d "$4"',
      `${remote}/database-${stamp}.dump.age`,
      KEY,
      entry.database.owner,
      entry.database.name,
    ),
  );
  for (const kind of ["private", "public"]) {
    timed(`restore the files of the bucket ${live.buckets[kind]} into ${entry.buckets[kind]}`, () =>
      run("rclone", ["copy", `${remote}/buckets/${live.buckets[kind]}`, `local:${entry.buckets[kind]}`]),
    );
  }

  const saved = existsSync(join(BUNDLE, "state.json")) ? JSON.parse(readFileSync(join(BUNDLE, "state.json"), "utf8")) : null;
  const release = saved?.active ? saved.releases[saved.active] : null;
  if (!release || !existsSync(join(BUNDLE, `${release}.tar.gz`))) throw new Error(`The backup ${stamp} of ${app} holds no live release to start`);
  const releaseDir = join(entry.folder, "releases", release);
  timed(`extract the release ${release} of ${app}`, () => {
    execFileSync("tar", ["-xzf", join(BUNDLE, `${release}.tar.gz`), "-C", join(entry.folder, "releases")]);
    owned(releaseDir);
  });

  const shared = join(entry.folder, "shared");
  const own = envFile(join(shared, ".env"));
  const merged = { ...envFile(join(BUNDLE, "shared", ".env")), NUXT_MAIL_URL: "smtp://127.0.0.1:1" };
  delete merged.NUXT_STORAGE_PUBLIC_URL;
  for (const name of OWN_CONNECTIONS) if (own[name] !== undefined) merged[name] = own[name];
  writeFileSync(join(shared, ".env"), Object.entries(merged).map(([name, value]) => `${name}=${JSON.stringify(value)}\n`).join(""), { mode: 0o600 });
  owned(join(shared, ".env"));
  console.log(`~ write ${shared}/.env: the settings of ${app} with the connections of ${rehearsal}, and outgoing mail to a closed port`);

  eraseAgain(entry, releaseDir, deployUser, stamp);

  const port = entry.ports.blue[0];
  const home = execFileSync("getent", ["passwd", deployUser], { encoding: "utf8" }).split(":")[5];
  timed(`start ${rehearsal} on 127.0.0.1:${port} without workers, so no job, mail, webhook or schedule runs, and wait until it is ready`, () =>
    shell(
      'cd "$5"\nsetsid runuser -u "$1" -- env -i PATH="$PATH" HOME="$2" NODE_ENV=production HOST=127.0.0.1 PORT="$3" NUXT_DATABASE_POOL_MAX=2 node --env-file="$4" .output/server/index.mjs > /dev/null 2>&1 & pid=$!\n' +
        'for attempt in $(seq 1 60); do if curl -fs -o /dev/null "http://127.0.0.1:$3/api/health/ready"; then kill -- -"$pid"; exit 0; fi; sleep 0.5; done\n' +
        'kill -- -"$pid" 2>/dev/null || true; echo "not ready on port $3" >&2; exit 1',
      deployUser,
      home,
      String(port),
      join(shared, ".env"),
      releaseDir,
    ),
  );
}

try {
  if (step === "fetch") fetch(argument);
  else if (step === "apply") apply(argument);
  else throw new Error("Usage: rehearsal fetch <app> <from> | apply <app> <user>");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
