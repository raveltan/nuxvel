if [ ! -f /etc/nuxvel/offsite.env ]; then
  echo "This server has no off-site bucket to restore from, /etc/nuxvel/offsite.env is missing" >&2
  exit 1
fi
work=/run/nuxvel-restore
rm -rf "$work"
install -d -m 700 "$work"
(umask 077 && printf '%s\n' "$NUXVEL_RECOVERY_KEY" > "$work/recovery.key" && printf '%s\n' "$NUXVEL_HELPER" > "$work/restore.cjs")
node "$work/restore.cjs" fetch "$NUXVEL_FROM" "$NUXVEL_DEPLOY_USER" "$NUXVEL_ENV"
