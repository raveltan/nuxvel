[ -d /srv/apps ] || change "create /srv/apps" install -d -m 755 /srv/apps
[ "$(stat -c '%U %a' "$NUXVEL_APP_DIR" 2>/dev/null)" = "$NUXVEL_DEPLOY_USER 750" ] ||
  change "create $NUXVEL_APP_DIR" install -d -m 750 -o "$NUXVEL_DEPLOY_USER" -g "$NUXVEL_DEPLOY_USER" "$NUXVEL_APP_DIR"
