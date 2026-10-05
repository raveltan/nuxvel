lock=$NUXVEL_APP_DIR/deploy.lock
if [ -e "$lock" ]; then
  echo "@locked $(cat "$lock")"
  exit 0
fi
env=$NUXVEL_APP_DIR/shared/.env
(umask 077 && printf '%s' "$NUXVEL_CONTENTS" > "$env.nuxvel-new")
chmod 600 "$env.nuxvel-new"
mv "$env.nuxvel-new" "$env"
echo "@written"
