name=nuxvel-$NUXVEL_APP-maintenance
entry=.output/server/nuxvel/maintenance.mjs

service="[Unit]
Description=Daily maintenance of $NUXVEL_APP
ConditionPathExists=$NUXVEL_APP_DIR/current/$entry

[Service]
Type=oneshot
User=$NUXVEL_DEPLOY_USER
WorkingDirectory=$NUXVEL_APP_DIR/current
EnvironmentFile=$NUXVEL_APP_DIR/shared/.env
EnvironmentFile=$NUXVEL_APP_DIR/shared/owner.env
ExecStart=/usr/bin/node $entry"

timer="[Unit]
Description=Daily maintenance of $NUXVEL_APP

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target"

start_timer() {
  write_file 644 "/etc/systemd/system/$name.service" "$service"
  write_file 644 "/etc/systemd/system/$name.timer" "$timer"
  systemctl enable "$name.timer"
  systemctl restart "$name.timer"
}

file_is "/etc/systemd/system/$name.service" "$service" && file_is "/etc/systemd/system/$name.timer" "$timer" ||
  change "run $entry of $NUXVEL_APP every day with the timer $name" start_timer
