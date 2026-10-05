#!/usr/bin/node
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } = require("node:fs");
const { parseEnv } = require("node:util");

const LOG_DIR = "/srv/nuxvel/erasures";
const OFFSITE_ENV = "/etc/nuxvel/offsite.env";

const [app, id] = process.argv.slice(2);
const apps = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8")).apps ?? {};
if (!app || !Object.hasOwn(apps, app) || !id || /[\s"\\]/.test(id) || id.length > 255) {
  console.error("Usage: erasure <app> <user id>, for an app in /srv/nuxvel/server.json");
  process.exit(2);
}

const caller = Number(process.env.SUDO_UID ?? 0);
if (caller !== 0 && statSync(apps[app].folder).uid !== caller) {
  console.error(`You do not own ${apps[app].folder}, so you cannot change the app ${app}`);
  process.exit(2);
}

const record = JSON.stringify({ time: new Date().toISOString(), id });
mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
appendFileSync(`${LOG_DIR}/${app}.jsonl`, `${record}\n`, { mode: 0o600 });

if (existsSync(OFFSITE_ENV)) {
  const env = parseEnv(readFileSync(OFFSITE_ENV, "utf8"));
  const name = `${JSON.parse(record).time.replace(/[-:.]/g, "")}-${randomUUID().slice(0, 8)}.json`;
  const uploaded = spawnSync("rclone", ["rcat", `offsite:${env.NUXVEL_OFFSITE_BUCKET}/${app}/erasures/${name}`], {
    input: `${record}\n`,
    env: { ...process.env, ...env },
    stdio: ["pipe", "ignore", "pipe"],
  });
  if (uploaded.status !== 0) {
    console.error(`The off-site upload of the erasure failed: ${String(uploaded.stderr).trim().split("\n").at(-1)}`);
    process.exit(1);
  }
}
