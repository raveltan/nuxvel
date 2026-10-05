if [ ! -x /usr/local/lib/nuxvel/restore ]; then
  echo "This server has no restore helper, /usr/local/lib/nuxvel/restore is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
NUXVEL_RESTORE_TO="$NUXVEL_TO" /usr/local/lib/nuxvel/restore "$NUXVEL_APP" "--from=$NUXVEL_FROM"
