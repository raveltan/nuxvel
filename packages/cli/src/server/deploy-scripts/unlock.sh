lock=$NUXVEL_APP_DIR/deploy.lock
if [ "$(cat "$lock" 2>/dev/null)" = "$NUXVEL_LOCK" ]; then
  rm "$lock"
fi
