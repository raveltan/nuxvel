if [ ! -f /srv/nuxvel/server.json ]; then
  echo "This server is not set up by nuxvel, /srv/nuxvel/server.json is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
if [ ! -f "$NUXVEL_APP_DIR/state.json" ]; then
  echo "@missing"
  exit 0
fi
lock=$NUXVEL_APP_DIR/deploy.lock
if ! (set -o noclobber; printf '%s\n' "$NUXVEL_LOCK" > "$lock") 2>/dev/null; then
  pid=$(cat "$NUXVEL_APP_DIR/hold.pid" 2>/dev/null || true)
  state=$( [ -n "$pid" ] && ps -o stat= -p "$pid" 2>/dev/null || true)
  if [ -n "$state" ] && [ "${state#Z}" = "$state" ] && grep -q hold.cjs "/proc/$pid/cmdline" 2>/dev/null; then
    echo "@holding $(cat "$lock")"
  else
    echo "@locked $(cat "$lock")"
  fi
  exit 0
fi
node - "$NUXVEL_APP" <<'JS'
const { readdirSync, readFileSync } = require("node:fs");
const registry = JSON.parse(readFileSync("/srv/nuxvel/server.json", "utf8"));
const states = {};
for (const [name, entry] of Object.entries(registry.apps ?? {})) {
  try {
    states[name] = JSON.parse(readFileSync(`${entry.folder}/state.json`, "utf8"));
  } catch {}
}
const folder = registry.apps?.[process.argv[2]]?.folder;
const releases = folder
  ? readdirSync(`${folder}/releases`, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
console.log(`@server ${JSON.stringify({ registry, states, releases })}`);
JS
