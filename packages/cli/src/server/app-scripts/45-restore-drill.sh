name=nuxvel-$NUXVEL_APP-restore-drill

service="[Unit]
Description=Weekly restore drill of $NUXVEL_APP
ConditionPathExists=/usr/local/lib/nuxvel/restore

[Service]
Type=oneshot
ExecStart=/usr/local/lib/nuxvel/restore $NUXVEL_APP --drill"

timer="[Unit]
Description=Weekly restore drill of $NUXVEL_APP

[Timer]
OnCalendar=Sun *-*-* 04:00:00 UTC
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

stop_timer() {
  systemctl disable "$name.timer"
  systemctl stop "$name.timer"
  rm -f "/etc/systemd/system/$name.timer" "/etc/systemd/system/$name.service"
  systemctl daemon-reload
}

if [ "$NUXVEL_RESTORE_DRILL" = 1 ]; then
  file_is "/etc/systemd/system/$name.service" "$service" && file_is "/etc/systemd/system/$name.timer" "$timer" ||
    change "restore the newest backup of $NUXVEL_APP into a scratch database every week with the timer $name" start_timer
elif [ -f "/etc/systemd/system/$name.timer" ]; then
  change "remove the timer $name" stop_timer
fi
