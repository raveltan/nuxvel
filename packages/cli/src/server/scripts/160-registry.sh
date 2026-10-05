file=/srv/nuxvel/server.json

registry() {
  node - "$(nproc)" "$NUXVEL_RAM_MB" "$NUXVEL_POSTGRES_MB" "$NUXVEL_REDIS_MB" "$NUXVEL_SERVICES_MB" "$NUXVEL_APPS_MB" <<'JS'
const { existsSync, readFileSync } = require("node:fs");
const [cpus, totalMb, postgresMb, redisMb, servicesMb, appsMb] = process.argv.slice(2).map(Number);
const file = "/srv/nuxvel/server.json";
const current = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const registry = {
  node: process.versions.node,
  cpus,
  services: {
    postgres: { version: 18, port: 5432, maxConnections: 100 },
    redis: { durable: { port: 6379 }, cache: { port: 6380 } },
    seaweedfs: { version: "4.47", s3Port: 8333 },
    caddy: { sites: "/etc/caddy/sites" },
    pm2: { version: 6 },
  },
  memory: { totalMb, postgresMb, redisMb, servicesMb, appsMb },
  apps: current.apps ?? {},
};
console.log(JSON.stringify(registry, null, 2));
JS
}

if ! command -v node >/dev/null; then
  change "write the server registry $file" true
else
  contents=$(registry)
  file_is "$file" "$contents" || change "write the server registry $file" write_file 644 "$file" "$contents"
fi
