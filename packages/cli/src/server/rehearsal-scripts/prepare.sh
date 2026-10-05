dpkg -s age >/dev/null 2>&1 || apt_install age
printf '%s\n' "$NUXVEL_RECOVERY_KEY" | age-keygen -y >/dev/null 2>&1 || {
  echo "The recovery key is not an age secret key" >&2
  exit 1
}
work=/run/nuxvel-rehearsal
rm -rf "$work"
install -d -m 700 "$work"
(umask 077 && printf '%s\n' "$NUXVEL_RECOVERY_KEY" > "$work/recovery.key" && printf '%s\n' "$NUXVEL_OFFSITE" > "$work/offsite.env" && printf '%s\n' "$NUXVEL_HELPER" > "$work/rehearsal.cjs")
if node -e 'process.exit(require("/srv/nuxvel/server.json").apps?.[process.argv[1]] ? 0 : 1)' "$NUXVEL_APP-rehearsal" 2>/dev/null; then
  echo "@leftover"
fi
