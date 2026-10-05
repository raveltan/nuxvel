if [ ! -f "$NUXVEL_APP_DIR/shared/.env" ]; then
  echo "$NUXVEL_APP_DIR/shared/.env is missing, the app is not on this server" >&2
  echo "Create it with nuxvel app:create" >&2
  exit 1
fi
cat "$NUXVEL_APP_DIR/shared/.env"
