lock=$NUXVEL_APP_DIR/deploy.lock
pid=$(cat "$NUXVEL_APP_DIR/hold.pid" 2>/dev/null || true)
state=$( [ -n "$pid" ] && ps -o stat= -p "$pid" 2>/dev/null || true)
if [ ! -f "$lock" ]; then
  echo "@none"
elif [ -n "$state" ] && [ "${state#Z}" = "$state" ] && grep -q hold.cjs "/proc/$pid/cmdline" 2>/dev/null; then
  echo "@holding $(cat "$lock")"
elif [ -n "$NUXVEL_LOCK" ] && [ "$(cat "$lock")" = "$NUXVEL_LOCK" ]; then
  rm "$lock"
  echo "@removed $NUXVEL_LOCK"
else
  echo "@locked $(cat "$lock")"
fi
