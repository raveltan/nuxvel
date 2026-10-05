const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const { app, dir, color, live, release, liveRelease } = config;
const rolling = config.strategy === "rolling";
const accessLog = `/var/log/caddy/${app}.access.log`;
const stateFile = `${dir}/state.json`;
const CHECK_MS = 2000;
const WINDOW_MS = 60000;
const MIN_REQUESTS = 10;
const MAX_ERROR_RATE = 0.1;
const MAX_READY_FAILURES = 3;
const ASSET_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (command, ...args) => execFileSync(command, args, { stdio: ["ignore", "inherit", "inherit"] });
const hasProcess = (name) => {
  try {
    execFileSync("pm2", ["describe", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const deleteProcess = (name) => hasProcess(name) && execFileSync("pm2", ["delete", name], { stdio: "ignore" });

function updateState(change) {
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  change(state);
  fs.writeFileSync(`${stateFile}.nuxvel-new`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(`${stateFile}.nuxvel-new`, stateFile);
  return state;
}

function pointCurrent(name) {
  fs.rmSync(`${dir}/current.nuxvel-new`, { force: true });
  fs.symlinkSync(`releases/${name}`, `${dir}/current.nuxvel-new`);
  fs.renameSync(`${dir}/current.nuxvel-new`, `${dir}/current`);
}

function unlock() {
  const lock = `${dir}/deploy.lock`;
  if (fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === `${config.lock}\n`) fs.unlinkSync(lock);
}

const fileSize = (file) => (fs.existsSync(file) ? fs.statSync(file).size : 0);
let offset = fileSize(accessLog);
let partial = "";
const requests = [];

function errorRate(now) {
  const end = fileSize(accessLog);
  if (end < offset) offset = 0;
  if (end > offset) {
    const buffer = Buffer.alloc(end - offset);
    const fd = fs.openSync(accessLog, "r");
    fs.readSync(fd, buffer, 0, buffer.length, offset);
    fs.closeSync(fd);
    offset = end;
    const lines = (partial + buffer.toString("utf8")).split("\n");
    partial = lines.pop() ?? "";
    for (const line of lines) {
      try {
        requests.push({ time: now, error: JSON.parse(line).status >= 500 });
      } catch {}
    }
  }
  while (requests.length > 0 && requests[0].time < now - WINDOW_MS) requests.shift();
  const errors = requests.filter((request) => request.error).length;

  return requests.length >= MIN_REQUESTS && errors / requests.length >= MAX_ERROR_RATE
    ? `${errors} of the last ${requests.length} requests answered 5xx`
    : undefined;
}

async function ready() {
  try {
    const response = await fetch(`http://127.0.0.1:${config.port}/api/health/ready`, { signal: AbortSignal.timeout(CHECK_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

async function alert(message) {
  if (!config.webhook) return;
  try {
    await fetch(config.webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app, environment: config.environment, event: "deploy.switched-back", message }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.log(`! The alert to the webhook failed: ${error.message}`);
  }
}

function rollBack() {
  fs.rmSync(`${dir}/${color}.nuxvel-new`, { force: true });
  fs.symlinkSync(`releases/${liveRelease}`, `${dir}/${color}.nuxvel-new`);
  fs.renameSync(`${dir}/${color}.nuxvel-new`, `${dir}/${color}`);
  for (const name of [`${app}-worker-${color}`, `${app}-web-${color}`]) {
    if (hasProcess(name)) {
      execFileSync("pm2", ["reload", `${dir}/ecosystem.${color}.config.cjs`, "--only", name, "--update-env"], { stdio: "ignore" });
    }
  }
  pointCurrent(liveRelease);
  updateState((state) => {
    state.releases[color] = liveRelease;
  });
}

function switchColor() {
  run("sudo", "-n", "/usr/local/lib/nuxvel/caddy-site", app, live);
  if (hasProcess(`${app}-worker-${live}`)) execFileSync("pm2", ["restart", `${app}-worker-${live}`], { stdio: "ignore" });
  deleteProcess(`${app}-web-${color}`);
  deleteProcess(`${app}-worker-${color}`);
  pointCurrent(liveRelease);
  updateState((state) => {
    state.active = live;
    state.releases[color] = null;
    delete state.processes?.[color];
  });
}

let rollbackRequested = false;
process.on("SIGUSR2", () => {
  rollbackRequested = true;
});

async function switchBack(problem) {
  console.log(`! ${problem} on ${color}: switching back to ${rolling ? liveRelease : live}`);
  if (rolling) rollBack();
  else switchColor();
  execFileSync("pm2", ["save"], { stdio: "ignore" });
  if (!rollbackRequested) await alert(
    `${release} of ${app} failed after the switch (${problem}), ${liveRelease} serves again. ` +
      "Jobs that the failed release queued may fail on the old workers: run nuxvel queue:retry after the next deploy.",
  );
  unlock();
  console.log("@outcome switched-back");
}

function assetFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true }).flatMap((entry) =>
    entry.isFile() ? [path.relative(root, path.join(entry.parentPath, entry.name))] : [],
  );
}

function retire() {
  if (live && !rolling) {
    deleteProcess(`${app}-web-${live}`);
    deleteProcess(`${app}-worker-${live}`);
    updateState((state) => delete state.processes?.[live]);
    console.log(`~ retire the ${live} processes of ${app}`);
  }
  execFileSync("pm2", ["save"], { stdio: "ignore" });

  const releases = fs.readdirSync(`${dir}/releases`, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const passed = new Set([...(state.passed ?? []), release]);
  const referenced = new Set(Object.values(state.releases).filter(Boolean));
  const newest = releases.filter((name) => passed.has(name)).slice(0, config.keepReleases);
  const kept = releases.filter((name) => newest.includes(name) || referenced.has(name));
  updateState((state) => {
    state.passed = kept.filter((name) => passed.has(name));
  });
  for (const name of releases.filter((name) => !kept.includes(name))) {
    fs.rmSync(`${dir}/releases/${name}`, { recursive: true, force: true });
    console.log(`~ remove the release ${name}`);
  }

  const used = new Set(kept.flatMap((name) => assetFiles(`${dir}/releases/${name}/.output/public/_nuxt`)));
  const assets = `/srv/nuxvel/assets/${app}/_nuxt`;
  const old = assetFiles(assets).filter((file) => !used.has(file) && Date.now() - fs.statSync(`${assets}/${file}`).mtimeMs > ASSET_MAX_AGE_MS);
  if (old.length > 0) execFileSync("sudo", ["-n", "/usr/local/lib/nuxvel/assets", app, "remove"], { input: old.join("\n"), stdio: ["pipe", "inherit", "inherit"] });
  if (old.length > 0) console.log(`~ remove ${old.length} assets older than 7 days that no kept release uses`);

  unlock();
  console.log(`Kept ${kept.length} of ${releases.length} releases`);
  console.log("@outcome retired");
}

async function main() {
  if (live && config.hold > 0) {
    console.log(rolling ? `Watching ${release} for ${config.hold}s` : `Holding ${live} for ${config.hold}s while ${color} serves`);
    if (!rolling && hasProcess(`${app}-web-${live}`)) {
      execFileSync("pm2", ["sendSignal", "SIGUSR2", `${app}-web-${live}`], { stdio: "ignore" });
      console.log(`~ close the realtime streams of ${app}-web-${live}, so its clients reconnect to ${color}`);
    }
    const until = Date.now() + config.hold * 1000;
    let failures = 0;
    while (Date.now() < until) {
      await sleep(CHECK_MS);
      failures = (await ready()) ? 0 : failures + 1;
      const problem = rollbackRequested
        ? "a rollback was requested"
        : failures >= MAX_READY_FAILURES
          ? `/api/health/ready failed ${failures} times in a row`
          : errorRate(Date.now());
      if (problem) return switchBack(problem);
    }
  }
  retire();
}

main().catch((error) => {
  console.log(`! The hold stopped: ${error.stack ?? error}`);
  unlock();
  console.log("@outcome failed");
  process.exitCode = 1;
});
