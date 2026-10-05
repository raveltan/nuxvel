if [ ! -f /srv/nuxvel/server.json ]; then
  echo "This server is not set up by nuxvel, /srv/nuxvel/server.json is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
up() {
  "$@" >/dev/null 2>&1 && echo true || echo false
}
redis_up() {
  [ "$(REDISCLI_AUTH=$(cat "/etc/nuxvel/redis-$1.password" 2>/dev/null) redis-cli -p "$2" --user nuxvel --no-auth-warning ping 2>/dev/null)" = PONG ]
}
answers() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1")" != 000 ]
}
postgres=$(up runuser -u postgres -- psql -XtAc 'select 1')
slow='[]'
if [ "$postgres" = true ]; then
  runuser -u postgres -- psql -XtAqc 'create extension if not exists pg_stat_statements' >/dev/null 2>&1 || true
  slow=$(runuser -u postgres -- psql -XtAc "select coalesce(json_agg(q), '[]') from (select d.datname as database, s.calls, round(s.mean_exec_time)::int as \"meanMs\", left(regexp_replace(s.query, '\s+', ' ', 'g'), 200) as query from pg_stat_statements s join pg_database d on d.oid = s.dbid where s.mean_exec_time >= 500 order by s.mean_exec_time desc limit 5) q" 2>/dev/null || echo '[]')
fi
export NUXVEL_SERVICES="{
  \"postgres\": $postgres,
  \"redis durable\": $(up redis_up durable 6379),
  \"redis cache\": $(up redis_up cache 6380),
  \"seaweedfs\": $(up answers http://127.0.0.1:8333/),
  \"caddy\": $(up curl -s -o /dev/null --max-time 5 --unix-socket /var/lib/caddy/admin.sock http://localhost/config/),
  \"pm2\": $(up runuser -u "$NUXVEL_DEPLOY_USER" -- env HOME="$(getent passwd "$NUXVEL_DEPLOY_USER" | cut -d: -f6)" pm2 ping)
}"
export NUXVEL_SLOW=$slow
export NUXVEL_SLOW_LOG
NUXVEL_SLOW_LOG=$(grep -h ' duration: ' /var/log/postgresql/postgresql-*-main.log 2>/dev/null | tail -n 5 || true)
export NUXVEL_DISK
NUXVEL_DISK=$(df -B1M --output=size,used /srv | tail -n 1)
node <<'JS'
const { readFileSync } = require("node:fs");
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const registry = readJson("/srv/nuxvel/server.json");
const meminfo = Object.fromEntries(
  readFileSync("/proc/meminfo", "utf8").split("\n").filter(Boolean).map((line) => {
    const [name, value] = line.split(":");
    return [name, Math.round(Number.parseInt(value, 10) / 1024)];
  }),
);
const [sizeMb, usedMb] = process.env.NUXVEL_DISK.trim().split(/\s+/).map(Number);
const apps = Object.entries(registry.apps ?? {}).map(([name, entry]) => {
  const state = readJson(`${entry.folder}/state.json`);
  return {
    name,
    color: state?.active ?? null,
    release: state?.active ? state.releases[state.active] : null,
    processes: state?.processes ?? {},
    backup: readJson(`/srv/nuxvel/backup-status/${name}.json`),
  };
});
const status = {
  disk: { sizeMb, usedMb },
  memory: { ...registry.memory, swapUsedMb: meminfo.SwapTotal - meminfo.SwapFree },
  maxConnections: registry.services.postgres.maxConnections,
  services: JSON.parse(process.env.NUXVEL_SERVICES),
  apps,
  slowQueries: JSON.parse(process.env.NUXVEL_SLOW),
  slowLog: process.env.NUXVEL_SLOW_LOG.split("\n").filter(Boolean),
};
console.log(`@status ${JSON.stringify(status)}`);
JS
