release=$NUXVEL_APP_DIR/releases/$NUXVEL_RELEASE
ecosystem=$NUXVEL_APP_DIR/ecosystem.$NUXVEL_COLOR.config.cjs
web=$NUXVEL_APP-web-$NUXVEL_COLOR
worker=$NUXVEL_APP-worker-$NUXVEL_COLOR
live_worker=$NUXVEL_APP-worker-$NUXVEL_LIVE

pm2() {
  command pm2 "$@" </dev/null
}

has_process() {
  pm2 describe "$1" >/dev/null 2>&1
}

ready() {
  local tries=0
  until curl -fs -o /dev/null --max-time 2 "http://127.0.0.1:$1/api/health/ready"; do
    tries=$((tries + 1))
    [ "$tries" -lt 30 ] || return 1
    sleep 1
  done
}

stop_new() {
  echo "$1" >&2
  for name in "$web" "$worker"; do
    if has_process "$name"; then
      pm2 logs "$name" --lines 40 --nostream --raw >&2 || true
      pm2 delete "$name" >/dev/null
    fi
  done
  echo "The live color keeps serving, nothing is switched" >&2
  exit 1
}

write_file 600 "$ecosystem" "$NUXVEL_ECOSYSTEM"
for name in "$web" "$worker"; do
  if has_process "$name"; then pm2 delete "$name" >/dev/null; fi
done
ln -sfn "releases/$NUXVEL_RELEASE" "$NUXVEL_APP_DIR/$NUXVEL_COLOR.nuxvel-new"
mv -T "$NUXVEL_APP_DIR/$NUXVEL_COLOR.nuxvel-new" "$NUXVEL_APP_DIR/$NUXVEL_COLOR"

pm2 start "$ecosystem" --only "$web" >/dev/null || stop_new "$web did not start"
echo "~ start $web on 127.0.0.1:$NUXVEL_PORT"
ready "$NUXVEL_PORT" || stop_new "$web is not ready: /api/health/ready fails on 127.0.0.1:$NUXVEL_PORT"
for path in $NUXVEL_SMOKE; do
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $NUXVEL_DOMAIN" -H "X-Forwarded-Proto: https" \
    "http://127.0.0.1:$NUXVEL_PORT$path") || true
  [ "$status" -ge 200 ] && [ "$status" -lt 500 ] || stop_new "$path answers $status on $web"
  echo "  $path answers $status"
done

if [ "$NUXVEL_WORKERS" -gt 0 ]; then
  pm2 start "$ecosystem" --only "$worker" >/dev/null || stop_new "$worker did not start"
  for port in $(seq $((NUXVEL_PORT + 1)) $((NUXVEL_PORT + NUXVEL_WORKERS))); do
    ready "$port" || stop_new "$worker is not ready: /api/health/ready fails on 127.0.0.1:$port"
  done
  echo "~ start $worker"
fi
if [ -n "$NUXVEL_LIVE" ] && has_process "$live_worker"; then
  pm2 stop "$live_worker" >/dev/null
  echo "~ stop $live_worker once its jobs finish"
fi

if ! sudo -n /usr/local/lib/nuxvel/caddy-site "$NUXVEL_APP" "$NUXVEL_COLOR"; then
  if [ -n "$NUXVEL_LIVE" ] && has_process "$live_worker"; then pm2 restart "$live_worker" >/dev/null; fi
  stop_new "Caddy refused the switch to $NUXVEL_COLOR"
fi
ln -sfn "releases/$NUXVEL_RELEASE" "$NUXVEL_APP_DIR/current.nuxvel-new"
mv -T "$NUXVEL_APP_DIR/current.nuxvel-new" "$NUXVEL_APP_DIR/current"
node - "$NUXVEL_APP_DIR/state.json" "$NUXVEL_COLOR" "$NUXVEL_RELEASE" "$NUXVEL_PROCESSES" <<'JS'
const { readFileSync, renameSync, writeFileSync } = require("node:fs");
const [file, color, release, processes] = process.argv.slice(2);
const state = JSON.parse(readFileSync(file, "utf8"));
state.active = color;
state.releases[color] = release;
state.processes = { ...state.processes, [color]: JSON.parse(processes) };
writeFileSync(`${file}.nuxvel-new`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
renameSync(`${file}.nuxvel-new`, file);
JS
pm2 save >/dev/null
echo "~ switch $NUXVEL_APP to $NUXVEL_COLOR: $NUXVEL_RELEASE is live"
