if ! node -e 'process.exit(require("/srv/nuxvel/server.json").apps?.[process.argv[1]] ? 0 : 1)' "$NUXVEL_APP" 2>/dev/null; then
  echo "$NUXVEL_APP is not on this server, /srv/nuxvel/server.json has no entry for it" >&2
  exit 1
fi
if [ "$NUXVEL_FINAL_BACKUP" = 1 ] && [ ! -f /etc/nuxvel/recovery.pub ]; then
  echo "The server has no recovery key to encrypt the final backup, /etc/nuxvel/recovery.pub is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
