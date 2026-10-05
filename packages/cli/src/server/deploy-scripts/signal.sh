log=$NUXVEL_APP_DIR/hold.log
pid=$(cat "$NUXVEL_APP_DIR/hold.pid" 2>/dev/null || true)
state=$( [ -n "$pid" ] && ps -o stat= -p "$pid" 2>/dev/null || true)
if [ -z "$state" ] || [ "${state#Z}" != "$state" ] || ! grep -q hold.cjs "/proc/$pid/cmdline" 2>/dev/null; then
  echo "@no-hold"
  exit 0
fi
start=$(stat -c %s "$log")
kill -USR2 "$pid"
