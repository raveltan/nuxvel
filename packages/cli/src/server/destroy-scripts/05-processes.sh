user=$(stat -c %U "$NUXVEL_APP_DIR" 2>/dev/null || true)
names="$NUXVEL_APP-web-blue $NUXVEL_APP-worker-blue $NUXVEL_APP-web-green $NUXVEL_APP-worker-green"

as_user() {
  runuser -u "$user" -- env HOME="$(getent passwd "$user" | cut -d: -f6)" "$@" </dev/null
}

delete_processes() {
  for name in $names; do
    as_user pm2 describe "$name" >/dev/null 2>&1 && as_user pm2 delete "$name" >/dev/null
  done
  as_user pm2 save >/dev/null
}

has_processes() {
  for name in $names; do
    as_user pm2 describe "$name" >/dev/null 2>&1 && return 0
  done
  return 1
}

[ -z "$user" ] || ! command -v pm2 >/dev/null || ! has_processes ||
  change "delete the pm2 processes of $NUXVEL_APP" delete_processes
