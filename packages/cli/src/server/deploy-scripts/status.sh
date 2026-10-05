node - "$NUXVEL_APP" "$NUXVEL_APP_DIR" <<'JS'
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const [app, dir] = process.argv.slice(2);
if (!existsSync(`${dir}/state.json`)) {
  console.log("@missing");
  process.exit(0);
}
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const state = readJson(`${dir}/state.json`);
const registry = readJson("/srv/nuxvel/server.json");
const processes = JSON.parse(execFileSync("pm2", ["jlist"], { encoding: "utf8" }))
  .filter(({ name }) => name.startsWith(`${app}-web-`) || name.startsWith(`${app}-worker-`))
  .map(({ name, pm_id, pm2_env, monit }) => ({
    name,
    id: pm_id,
    status: pm2_env.status,
    memoryMb: Math.round((monit?.memory ?? 0) / 1048576),
    restarts: pm2_env.restart_time ?? 0,
    startedAt: pm2_env.status === "online" ? new Date(pm2_env.pm_uptime).toISOString() : null,
  }));
const port = state.active ? registry?.apps?.[app]?.ports?.[state.active]?.[0] : undefined;
const health = async () => {
  if (!port) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`, { signal: AbortSignal.timeout(5000) });
    return { ready: response.ok, status: response.status };
  } catch {
    return { ready: false, status: null };
  }
};
health().then((ready) => {
  const release = state.active ? state.releases[state.active] : null;
  const backup = readJson(`/srv/nuxvel/backup-status/${app}.json`);
  console.log(`@status ${JSON.stringify({ color: state.active, release, health: ready, backup, processes })}`);
});
JS
