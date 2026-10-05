work=/run/nuxvel-dr-check
rm -rf "$work"
install -d -m 700 "$work"
trap 'rm -rf "$work"' EXIT
(umask 077 && printf '%s\n' "$NUXVEL_RECOVERY_KEY" > "$work/recovery.key")
if ! public=$(age-keygen -y "$work/recovery.key" 2>/dev/null); then
  echo "The recovery key is not an age secret key" >&2
  exit 1
fi
if [ "$public" != "$(cat /etc/nuxvel/recovery.pub 2>/dev/null)" ]; then
  echo "@mismatch $public"
  exit 0
fi
check() {
  local source=$1 stamp=$2
  if tar -t -f "$work/bundle.tar" 2>/dev/null | grep -qx './server.json'; then
    echo "@decrypts $source $stamp"
  else
    echo "@fails $source $stamp"
  fi
}
folder=/srv/nuxvel/backups/$NUXVEL_APP
latest=$( (ls "$folder" 2>/dev/null || true) | sed -n 's/^config-\([0-9TZ]*\)\.tar\.age$/\1/p' | sort | tail -n 1)
if [ -n "$latest" ]; then
  age -d -i "$work/recovery.key" -o "$work/bundle.tar" "$folder/config-$latest.tar.age" 2>/dev/null || : > "$work/bundle.tar"
  check local "$latest"
fi
if [ -f /etc/nuxvel/offsite.env ]; then
  set -a
  . /etc/nuxvel/offsite.env
  set +a
  remote=offsite:$NUXVEL_OFFSITE_BUCKET/$NUXVEL_APP
  if ! files=$(rclone lsf "$remote" --files-only 2>"$work/lsf.err"); then
    echo "@offsite-unreadable $(tail -n 1 "$work/lsf.err")"
    exit 0
  fi
  latest=$(printf '%s\n' "$files" | sed -n 's/^config-\([0-9TZ]*\)\.tar\.age$/\1/p' | sort | tail -n 1)
  if [ -n "$latest" ]; then
    { rclone cat "$remote/config-$latest.tar.age" | age -d -i "$work/recovery.key" -o "$work/bundle.tar"; } 2>/dev/null || : > "$work/bundle.tar"
    check off-site "$latest"
  else
    echo "@offsite-missing"
  fi
fi
