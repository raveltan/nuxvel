if [ ! -x /usr/local/lib/nuxvel/backup ]; then
  echo "This server has no backup helper, /usr/local/lib/nuxvel/backup is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
if ! node -e 'process.exit(require("/srv/nuxvel/server.json").apps?.[process.argv[1]] ? 0 : 1)' "$NUXVEL_APP" 2>/dev/null; then
  echo "$NUXVEL_APP is not on this server, /srv/nuxvel/server.json has no entry for it" >&2
  exit 1
fi
/usr/local/lib/nuxvel/backup "$NUXVEL_APP"
