file=/srv/nuxvel/server.json

registry() {
  node - "$NUXVEL_APP" "$NUXVEL_APP_DIR" "$NUXVEL_DOMAINS" "$NUXVEL_REDIRECTS" "$NUXVEL_FILES_DOMAIN" "$NUXVEL_RESTORE_DRILL" <<'JS'
const { readFileSync } = require("node:fs");
const [app, folder, domains, redirects, filesDomain, restoreDrill] = process.argv.slice(2);
const registry = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8"));
const apps = registry.apps ?? {};
const taken = Object.entries(apps)
  .filter(([name]) => name !== app)
  .flatMap(([, entry]) => Object.values(entry.ports ?? {}));
const free = (first) => taken.every(([low, high]) => first + 19 < low || first > high);
let first = apps[app]?.ports?.blue?.[0] ?? 3000;
if (!apps[app]?.ports) while (!free(first)) first += 20;
const database = app.replaceAll("-", "_");
const processes = (color) => [`${app}-web-${color}`, `${app}-worker-${color}`];
apps[app] = {
  ...apps[app],
  folder,
  domains: domains ? domains.split(" ") : [],
  redirects: JSON.parse(redirects),
  filesDomain: filesDomain || null,
  ports: { blue: [first, first + 9], green: [first + 10, first + 19] },
  pm2: { blue: processes("blue"), green: processes("green") },
  database: { name: database, owner: `${database}_owner`, runtime: `${database}_app` },
  redis: { user: app, prefix: `${app}:`, instances: ["durable", "cache"] },
  buckets: { user: app, private: `${app}-private`, public: `${app}-public` },
  timers: [`nuxvel-${app}-maintenance.timer`, ...(restoreDrill === "1" ? [`nuxvel-${app}-restore-drill.timer`] : [])],
};
console.log(`blue ${first}-${first + 9}, green ${first + 10}-${first + 19}`);
console.log(JSON.stringify({ ...registry, apps }, null, 2));
JS
}

output=$(registry)
contents=${output#*$'\n'}
echo "Ports of $NUXVEL_APP on localhost: ${output%%$'\n'*}"
file_is "$file" "$contents" || change "record $NUXVEL_APP in the server registry $file" write_file 644 "$file" "$contents"
