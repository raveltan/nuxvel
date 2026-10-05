shared=$NUXVEL_APP_DIR/shared
old_assets=$shared/assets
assets=/srv/nuxvel/assets/$NUXVEL_APP/_nuxt
state=$NUXVEL_APP_DIR/state.json
initial_state='{
  "active": null,
  "releases": { "blue": null, "green": null },
  "contractMigrations": []
}'

has_folder() {
  [ "$(stat -c '%U %a' "$1" 2>/dev/null)" = "$NUXVEL_DEPLOY_USER $2" ]
}

make_folder() {
  install -d -m "$2" -o "$NUXVEL_DEPLOY_USER" -g "$NUXVEL_DEPLOY_USER" "$1"
}

make_assets() {
  install -d -m 755 "$assets"
}

move_old_assets() {
  runuser -u "$NUXVEL_DEPLOY_USER" -- tar -C "$old_assets/_nuxt" -c . | /usr/local/lib/nuxvel/assets "$NUXVEL_APP" add
  rm -rf "$old_assets"
}

write_state() {
  printf '%s\n' "$initial_state" | deploy_write "$state"
}

has_folder "$NUXVEL_APP_DIR/releases" 700 ||
  change "create $NUXVEL_APP_DIR/releases" make_folder "$NUXVEL_APP_DIR/releases" 700
has_folder "$shared" 700 || change "create $shared, which only $NUXVEL_DEPLOY_USER may read" make_folder "$shared" 700
[ "$(stat -c '%U %a' "$assets" 2>/dev/null)" = "root 755" ] ||
  change "create $assets, which only root may write and Caddy may read" make_assets
[ ! -d "$old_assets" ] || change "move the assets of $old_assets into $assets" move_old_assets
[ -f "$state" ] || change "write $state with no release yet" write_state
