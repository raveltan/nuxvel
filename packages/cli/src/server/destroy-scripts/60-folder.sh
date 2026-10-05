[ ! -e "$NUXVEL_APP_DIR" ] || change "remove $NUXVEL_APP_DIR" rm -rf "$NUXVEL_APP_DIR"
[ ! -e "/srv/nuxvel/assets/$NUXVEL_APP" ] || change "remove /srv/nuxvel/assets/$NUXVEL_APP" rm -rf "/srv/nuxvel/assets/$NUXVEL_APP"
status=/srv/nuxvel/backup-status/$NUXVEL_APP
[ ! -e "$status.json" ] && [ ! -e "$status.drill.json" ] || change "remove the backup and restore drill status of $NUXVEL_APP" rm -f "$status.json" "$status.drill.json"
backups=/srv/nuxvel/backups/$NUXVEL_APP

remove_backups() {
  find "$backups" -mindepth 1 -maxdepth 1 ! -name 'final-*' -exec rm -rf {} +
  rmdir --ignore-fail-on-non-empty "$backups"
}

[ -z "$(find "$backups" -mindepth 1 -maxdepth 1 ! -name 'final-*' 2>/dev/null)" ] ||
  change "remove the nightly backups of $NUXVEL_APP from $backups, except the final backups" remove_backups
