#!/usr/bin/node
const { execFileSync, spawnSync } = require("node:child_process");
const { X509Certificate } = require("node:crypto");
const { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { parseEnv } = require("node:util");

const STATE = "/var/lib/nuxvel/monitor.json";
const ALERTS = "/etc/nuxvel/alerts.json";
const METRICS = "/var/lib/nuxvel-metrics/metrics.prom";
const LOG = "/var/log/nuxvel/monitor.log";
const CERTIFICATES = "/var/lib/caddy/.local/share/caddy/certificates";
const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const INCOMPATIBLE = /received payload version \d+, newer than|has no upcaster for payload version|is not a \{ version, payload \} envelope/;

const now = Date.now();
const state = readJson(STATE) ?? { conditions: {}, memory: {} };
const lastRun = state.lastRun ?? now;
const registry = readJson("/srv/nuxvel/server.json") ?? { apps: {} };
const found = [];
const metrics = [];
const alerts = readJson(ALERTS) ?? {};

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function succeeds(command, args, options = {}) {
  return spawnSync(command, args, { cwd: "/", stdio: "ignore", timeout: 10000, ...options }).status === 0;
}

function output(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: "/", encoding: "utf8", timeout: 10000, ...options });
  return result.status === 0 ? result.stdout.trim() : null;
}

function condition(key, severity, message, holdMs = 0) {
  found.push({ key, severity, message, holdMs });
}

function metric(name, labels, value) {
  const text = Object.entries(labels).map(([label, content]) => `${label}="${String(content).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",");
  metrics.push(`${name}${text ? `{${text}}` : ""} ${value}`);
}

function remembered(key, value) {
  const previous = state.memory[key];
  state.memory[key] = value;
  return previous;
}

function checkDisk() {
  const line = output("df", ["--output=pcent", "/srv"]);
  const percent = Number(line?.split("\n").at(-1)?.replace("%", "").trim());
  metric("nuxvel_disk_used_percent", {}, percent);
  if (percent >= 90) condition("disk", "critical", `The disk is ${percent}% full`);
  else if (percent >= 80) condition("disk", "warning", `The disk is ${percent}% full`);
}

function checkMemory() {
  const meminfo = Object.fromEntries(
    readFileSync("/proc/meminfo", "utf8").split("\n").filter(Boolean).map((line) => [line.split(":")[0], Number.parseInt(line.split(":")[1], 10)]),
  );
  const swapMb = Math.round((meminfo.SwapTotal - meminfo.SwapFree) / 1024);
  metric("nuxvel_swap_used_megabytes", {}, swapMb);
  if (swapMb > 0) condition("swap", "warning", `${swapMb} MB of swap is in use`, 10 * MINUTE);

  const kills = Number(/^oom_kill (\d+)$/m.exec(readFileSync("/proc/vmstat", "utf8"))?.[1] ?? 0);
  const previous = remembered("oomKills", kills);
  if (previous !== undefined && kills > previous) state.memory.lastOomKill = now;
  if (state.memory.lastOomKill && now - state.memory.lastOomKill < HOUR) condition("oom", "critical", "The kernel killed a process that ran out of memory");
}

function redis(name, port, args) {
  const password = existsSync(`/etc/nuxvel/redis-${name}.password`) ? readFileSync(`/etc/nuxvel/redis-${name}.password`, "utf8").trim() : "";
  return output("redis-cli", ["-p", String(port), "--user", "nuxvel", "--no-auth-warning", ...args], { env: { ...process.env, REDISCLI_AUTH: password } });
}

function checkServices() {
  const up = {
    postgres: succeeds("runuser", ["-u", "postgres", "--", "psql", "-X", "-tAc", "select 1"]),
    "redis-durable": redis("durable", 6379, ["ping"]) === "PONG",
    "redis-cache": redis("cache", 6380, ["ping"]) === "PONG",
    seaweedfs: succeeds("curl", ["-s", "-o", "/dev/null", "--max-time", "5", "http://127.0.0.1:8333/"]),
    caddy: succeeds("curl", ["-s", "-o", "/dev/null", "--max-time", "5", "--unix-socket", "/var/lib/caddy/admin.sock", "http://localhost/config/"]),
  };
  const names = { postgres: "Postgres", "redis-durable": "Redis durable", "redis-cache": "Redis cache", seaweedfs: "SeaweedFS", caddy: "Caddy" };
  for (const [service, answers] of Object.entries(up)) {
    metric("nuxvel_service_up", { service }, answers ? 1 : 0);
    if (!answers) condition(`service:${service}`, "critical", `${names[service]} is not answering`);
  }
}

function checkHealth(app, entry, appState) {
  if (!appState?.active) return;
  const port = entry.ports[appState.active][0];
  const ready = succeeds("curl", ["-fs", "-o", "/dev/null", "--max-time", "5", `http://127.0.0.1:${port}/api/health/ready`]);
  metric("nuxvel_app_ready", { app }, ready ? 1 : 0);
  if (!ready) {
    condition(`health:${app}`, "critical", `${app}: /api/health/ready on ${appState.active} fails`, 2 * MINUTE);
  }
}

function checkBackups(app, entry, appState) {
  const backup = readJson(`/srv/nuxvel/backup-status/${app}.json`);
  if (appState?.active) state.memory[`activeSince:${app}`] ??= now;
  const age = now - (backup ? Date.parse(backup.time) : (state.memory[`activeSince:${app}`] ?? now));
  if (backup) metric("nuxvel_backup_age_seconds", { app }, Math.round(age / 1000));
  if (appState?.active && age > 26 * HOUR) {
    condition(`backup:${app}`, "critical", backup ? `${app}: the newest backup is from ${backup.time}, over 26 hours ago` : `${app} has no backup`);
  }
  if (backup?.offsite?.ok === false) condition(`offsite:${app}`, "critical", `${app}: the off-site upload failed: ${backup.offsite.error}`);
  const drill = readJson(`/srv/nuxvel/backup-status/${app}.drill.json`);
  if (drill?.ok === false) condition(`drill:${app}`, "critical", `${app}: the restore drill of ${drill.from} failed: ${drill.problems.join(", ")}`);
  const timer = `/etc/systemd/system/nuxvel-${app}-restore-drill.timer`;
  if (existsSync(timer) && now - (drill ? Date.parse(drill.time) : statSync(timer).mtimeMs) > 8 * 24 * HOUR) {
    condition(`drill-stale:${app}`, "warning", drill ? `${app}: the last restore drill ran on ${drill.time}, over 8 days ago` : `${app}: the weekly restore drill has not run once in 8 days`);
  }
}

function checkJobs(app, entry) {
  const prefix = `${entry.redis?.prefix ?? `${app}:`}bull:`;
  const keys = (redis("durable", 6379, ["--scan", "--pattern", `${prefix}*`]) ?? "").split("\n").filter(Boolean);
  const queues = [...new Set(keys.map((key) => /^(.*):(wait|failed|active|meta|id|events|completed|delayed|prioritized|paused|marker|stalled-check)$/.exec(key.slice(prefix.length))?.[1]).filter(Boolean))];
  let failed = 0;
  for (const queue of queues) {
    const base = `${prefix}${queue}`;
    const counts = {
      waiting: Number(redis("durable", 6379, ["llen", `${base}:wait`]) ?? 0),
      active: Number(redis("durable", 6379, ["llen", `${base}:active`]) ?? 0),
      delayed: Number(redis("durable", 6379, ["zcard", `${base}:delayed`]) ?? 0),
      failed: Number(redis("durable", 6379, ["zcard", `${base}:failed`]) ?? 0),
    };
    for (const [jobState, count] of Object.entries(counts)) metric("nuxvel_queue_jobs", { app, queue, state: jobState }, count);
    failed += counts.failed;

    const oldest = redis("durable", 6379, ["lindex", `${base}:wait`, "-1"]);
    const queuedAt = oldest ? Number(redis("durable", 6379, ["hget", `${base}:${oldest}`, "timestamp"])) : 0;
    if (queuedAt && now - queuedAt > 10 * MINUTE) {
      condition(`waiting:${app}:${queue}`, "warning", `${app}: a job has waited in the queue ${queue} for ${Math.round((now - queuedAt) / MINUTE)} minutes`);
    }

    const recent = (redis("durable", 6379, ["zrangebyscore", `${base}:failed`, String(lastRun), "+inf"]) ?? "").split("\n").filter(Boolean);
    for (const id of recent) {
      const reason = redis("durable", 6379, ["hget", `${base}:${id}`, "failedReason"]) ?? "";
      if (INCOMPATIBLE.test(reason)) state.memory[`incompatible:${app}`] = { time: now, reason };
    }
  }
  const previous = remembered(`failed:${app}`, failed);
  if (previous !== undefined && failed > previous) state.memory[`failedGrew:${app}`] = now;
  if (now - (state.memory[`failedGrew:${app}`] ?? 0) < 10 * MINUTE) condition(`failed-jobs:${app}`, "warning", `${app}: the failed jobs grow, ${failed} now`);
  const incompatible = state.memory[`incompatible:${app}`];
  if (incompatible && now - incompatible.time < HOUR) condition(`incompatible:${app}`, "critical", `${app}: a job failed on an incompatible payload: ${incompatible.reason}`);
}

function poolSize(entry, appState) {
  if (!appState.active) return null;
  try {
    const text = readFileSync(join(entry.folder, `ecosystem.${appState.active}.config.cjs`), "utf8");
    const { apps } = JSON.parse(text.replace(/^module\.exports = /, "").replace(/;\s*$/, ""));
    const total = apps.reduce((sum, app) => sum + app.instances * Number(app.env.NUXT_DATABASE_POOL_MAX ?? 10), 0);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}

function appSql(entry, query) {
  let password;
  try {
    password = decodeURIComponent(new URL(parseEnv(readFileSync(join(entry.folder, "shared", ".env"), "utf8")).NUXT_DATABASE_URL).password);
  } catch {
    return null;
  }
  const conninfo = `host=127.0.0.1 port=5432 sslmode=disable dbname=${entry.database.name} user=${entry.database.runtime}`;
  return output("psql", ["-X", "-tA", conninfo, "-c", query], { env: { PATH: process.env.PATH, PGPASSWORD: password } });
}

function checkDatabase(app, entry, appState) {
  const sql = (query) => appSql(entry, query);
  const connections = output("runuser", ["-u", "postgres", "--", "psql", "-X", "-tA", "-d", "postgres", "-c", `select count(*) from pg_stat_activity where datname = '${entry.database.name}'`]);
  if (connections !== null) metric("nuxvel_db_connections", { app }, Number(connections));
  const pool = poolSize(entry, appState);
  if (pool !== null) metric("nuxvel_db_pool_size", { app }, pool);
  if (sql("select to_regclass('public.outbox') is not null") === "t") {
    const oldest = sql("select min(id) from outbox where dispatched_at is null") || null;
    const seen = state.memory[`outbox:${app}`];
    const since = seen?.id === oldest ? seen.since : now;
    state.memory[`outbox:${app}`] = oldest ? { id: oldest, since } : null;
    if (oldest && now - since >= MINUTE) condition(`outbox:${app}`, "critical", `${app}: an outbox row has stayed unsent for over a minute`);
  }
  if (sql("select to_regclass('public.backfills') is not null") === "t") {
    for (const name of (sql("select name from backfills where completed_at is null and updated_at < now() - interval '30 minutes'") ?? "").split("\n").filter(Boolean)) {
      condition(`backfill:${app}:${name}`, "warning", `${app}: the backfill ${name} has made no progress for 30 minutes`);
    }
  }
}

function checkSwitchBack(app, entry) {
  const log = join(entry.folder, "hold.log");
  if (existsSync(log) && statSync(log).mtimeMs > lastRun) {
    const hold = readFileSync(log, "utf8");
    if (hold.includes("@outcome switched-back") && !hold.includes("! a rollback was requested on ")) state.memory[`switchedBack:${app}`] = now;
  }
  if (now - (state.memory[`switchedBack:${app}`] ?? 0) < HOUR) condition(`switch-back:${app}`, "critical", `${app}: a deploy failed after its switch and switched back`);
}

function checkCertificates() {
  const domains = new Set(Object.values(registry.apps ?? {}).flatMap((entry) => [...(entry.domains ?? []), ...(entry.filesDomain ? [entry.filesDomain] : [])]));
  if (!existsSync(CERTIFICATES)) return;
  for (const issuer of readdirSync(CERTIFICATES)) {
    for (const domain of domains) {
      const file = join(CERTIFICATES, issuer, domain, `${domain}.crt`);
      if (!existsSync(file)) continue;
      const expires = Date.parse(new X509Certificate(readFileSync(file)).validTo);
      if (expires - now < 14 * 24 * HOUR) {
        condition(`tls:${domain}`, "warning", `The TLS certificate of ${domain} expires on ${new Date(expires).toISOString().slice(0, 10)}`);
      }
    }
  }
}

function checkReboot() {
  const file = "/var/run/reboot-required";
  if (existsSync(file) && now - statSync(file).mtimeMs > 7 * 24 * HOUR) {
    condition("reboot", "warning", "Security updates have waited on a reboot for over 7 days: run nuxvel server:upgrade <env> --reboot");
  }
}

function log(event) {
  mkdirSync("/var/log/nuxvel", { recursive: true, mode: 0o755 });
  appendFileSync(LOG, `${JSON.stringify({ time: new Date(now).toISOString(), ...event })}\n`, { mode: 0o644 });
  if (event.event === "firing" || event.event === "resolved") console.log(`${event.event === "resolved" ? "resolved" : event.severity}: ${event.message}`);
  else console.log(`${event.event}: ${event.channel}: ${event.error}`);
}

function curl(args, input) {
  const result = spawnSync("curl", ["-fsS", "--max-time", "20", ...args], { input, encoding: "utf8", timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `curl exited with ${result.status}`);
}

const channels = {
  email: alerts.email && alerts.smtp
    ? (alert) => {
        const subject = `[nuxvel] ${alert.event === "resolved" ? "resolved" : alert.severity} on ${alerts.server}: ${alert.message}`;
        const body = [`${alert.message}`, "", `Server: ${alerts.server}`, `Alert: ${alert.key}`, `Severity: ${alert.severity}`, `Time: ${alert.time}`].join("\r\n");
        const message = [`From: nuxvel <${alerts.email}>`, `To: ${alerts.email}`, `Subject: ${subject}`, `Date: ${new Date(now).toUTCString()}`, "Content-Type: text/plain; charset=utf-8", "", body, ""].join("\r\n");
        curl([new URL(alerts.smtp).username ? "--ssl-reqd" : "--ssl", "--url", alerts.smtp, "--mail-from", alerts.email, "--mail-rcpt", alerts.email, "--upload-file", "-"], message);
      }
    : null,
  webhook: alerts.webhook
    ? (alert) => curl(["-H", "content-type: application/json", "--data-binary", "@-", alerts.webhook], JSON.stringify({ server: alerts.server, ...alert }))
    : null,
};

function deliver(alert, sent = {}) {
  const delivered = { ...sent };
  for (const [name, send] of Object.entries(channels)) {
    if (!send || (sent[name] !== undefined && now - sent[name] < HOUR)) continue;
    try {
      send(alert);
      delivered[name] = now;
    } catch (error) {
      log({ event: "delivery-failed", channel: name, key: alert.key, error: error.message });
    }
  }
  return delivered;
}

function run(check, ...args) {
  try {
    check(...args);
  } catch (error) {
    condition(`monitor:${check.name}`, "warning", `The monitor check ${check.name} failed: ${error.message}`);
  }
}

if (process.argv.includes("--test")) {
  const alert = { event: "test", key: "test", severity: "info", message: "A test alert from nuxvel alerts:test", time: new Date(now).toISOString() };
  const heartbeat = alerts.heartbeat ? () => curl([alerts.heartbeat, "-o", "/dev/null"]) : null;
  const configured = Object.entries({ ...channels, heartbeat }).filter(([, send]) => send);
  if (configured.length === 0) console.log("@none");
  for (const [name, send] of configured) {
    try {
      send(alert);
      console.log(`@channel ${name} ok`);
    } catch (error) {
      console.log(`@channel ${name} failed ${error.message}`);
    }
  }
  process.exit(0);
}

run(checkDisk);
run(checkMemory);
run(checkServices);
for (const [app, entry] of Object.entries(registry.apps ?? {})) {
  const { active } = readJson(join(entry.folder, "state.json")) ?? {};
  const appState = { active: active === "blue" || active === "green" ? active : null };
  run(checkHealth, app, entry, appState);
  run(checkBackups, app, entry, appState);
  run(checkJobs, app, entry);
  run(checkDatabase, app, entry, appState);
  run(checkSwitchBack, app, entry);
}
run(checkCertificates);
run(checkReboot);

const time = new Date(now).toISOString();
const current = {};
for (const { key, severity, message, holdMs } of found) {
  const previous = state.conditions[key];
  const since = previous?.since ?? now;
  const firing = previous?.firing === true || now - since >= holdMs;
  current[key] = { since, severity, message, firing, sent: previous?.sent ?? {} };
  if (firing && !previous?.firing) log({ event: "firing", key, severity, message });
  if (firing) current[key].sent = deliver({ event: "firing", key, severity, message, time, repeat: previous?.firing === true }, current[key].sent);
}
for (const [key, previous] of Object.entries(state.conditions)) {
  if (current[key] || !previous.firing) continue;
  const alert = { event: "resolved", key, severity: previous.severity, message: `Resolved: ${previous.message}`, time };
  log(alert);
  deliver(alert);
}
for (const [key, { severity, firing }] of Object.entries(current)) if (firing) metric("nuxvel_alert_firing", { key, severity }, 1);
if (alerts.heartbeat) {
  try {
    curl([alerts.heartbeat, "-o", "/dev/null"]);
  } catch (error) {
    log({ event: "delivery-failed", channel: "heartbeat", error: error.message });
  }
}
mkdirSync("/var/lib/nuxvel-metrics", { recursive: true, mode: 0o755 });
writeFileSync(`${METRICS}.partial`, `${metrics.join("\n")}\n`, { mode: 0o644 });
execFileSync("mv", [`${METRICS}.partial`, METRICS]);

state.conditions = current;
state.lastRun = now;
mkdirSync("/var/lib/nuxvel", { recursive: true, mode: 0o700 });
writeFileSync(`${STATE}.partial`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
execFileSync("mv", [`${STATE}.partial`, STATE]);
