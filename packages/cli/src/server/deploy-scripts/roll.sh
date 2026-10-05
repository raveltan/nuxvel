ecosystem=$NUXVEL_APP_DIR/ecosystem.$NUXVEL_COLOR.config.cjs
link=$NUXVEL_APP_DIR/$NUXVEL_COLOR
web=$NUXVEL_APP-web-$NUXVEL_COLOR
worker=$NUXVEL_APP-worker-$NUXVEL_COLOR
previous=$(readlink "$link" 2>/dev/null || true)

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

point() {
  ln -sfn "$1" "$link.nuxvel-new"
  mv -T "$link.nuxvel-new" "$link"
}

roll() {
  local name=$1 count=$2
  if [ "$count" -eq 0 ]; then
    if has_process "$name"; then pm2 delete "$name" >/dev/null; fi
  elif has_process "$name"; then
    pm2 reload "$ecosystem" --only "$name" --update-env >/dev/null || return 1
    pm2 scale "$name" "$count" >/dev/null 2>&1 || true
  else
    pm2 start "$ecosystem" --only "$name" >/dev/null
  fi
}

roll_back() {
  echo "$1" >&2
  for name in "$web" "$worker"; do
    if has_process "$name"; then pm2 logs "$name" --lines 40 --nostream --raw >&2 || true; fi
  done
  if [ -n "$previous" ]; then
    point "$previous"
    roll "$worker" "$NUXVEL_WORKERS" || true
    roll "$web" "$NUXVEL_WEB" || true
    echo "Rolled $NUXVEL_APP back to ${previous#releases/}, nothing is switched" >&2
  else
    for name in "$web" "$worker"; do
      if has_process "$name"; then pm2 delete "$name" >/dev/null; fi
    done
    echo "Stopped the new processes, nothing is switched" >&2
  fi
  exit 1
}

write_file 600 "$ecosystem" "$NUXVEL_ECOSYSTEM"
point "releases/$NUXVEL_RELEASE"
roll "$worker" "$NUXVEL_WORKERS" || roll_back "$worker did not start"
for port in $(seq $((NUXVEL_PORT + 1)) $((NUXVEL_PORT + NUXVEL_WORKERS))); do
  ready "$port" || roll_back "$worker is not ready: /api/health/ready fails on 127.0.0.1:$port"
done
[ "$NUXVEL_WORKERS" -eq 0 ] || echo "~ replace $worker"
roll "$web" "$NUXVEL_WEB" || roll_back "$web did not start"
echo "~ replace the processes of $web one at a time on 127.0.0.1:$NUXVEL_PORT"
ready "$NUXVEL_PORT" || roll_back "$web is not ready: /api/health/ready fails on 127.0.0.1:$NUXVEL_PORT"
for path in $NUXVEL_SMOKE; do
  status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $NUXVEL_DOMAIN" -H "X-Forwarded-Proto: https" \
    "http://127.0.0.1:$NUXVEL_PORT$path") || true
  [ "$status" -ge 200 ] && [ "$status" -lt 500 ] || roll_back "$path answers $status on $web"
  echo "  $path answers $status"
done

sudo -n /usr/local/lib/nuxvel/caddy-site "$NUXVEL_APP" "$NUXVEL_COLOR" || roll_back "Caddy refused the site of $NUXVEL_COLOR"
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
echo "~ roll $NUXVEL_APP on $NUXVEL_COLOR: $NUXVEL_RELEASE is live"
