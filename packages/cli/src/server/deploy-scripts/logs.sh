state=$NUXVEL_APP_DIR/state.json
if [ ! -f "$state" ]; then
  echo "$NUXVEL_APP is not on this server" >&2
  exit 1
fi
if [ "$NUXVEL_SOURCE" = caddy ]; then
  exec tail -n "$NUXVEL_LINES" -F "/var/log/caddy/$NUXVEL_APP.access.log" 2>/dev/null
fi
active=$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).active ?? ""' "$state")
if [ -z "$active" ]; then
  echo "$NUXVEL_APP has no live release yet" >&2
  exit 1
fi
exec pm2 logs "/^$NUXVEL_APP-$NUXVEL_SOURCE-$active\$/" --raw --lines "$NUXVEL_LINES"
