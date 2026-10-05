helper=/usr/local/lib/nuxvel/backup

service='[Unit]
Description=Nightly backup of every nuxvel app
After=postgresql.service seaweedfs.service

[Service]
Type=oneshot
ExecStart=/usr/local/lib/nuxvel/backup'

timer='[Unit]
Description=Nightly backup of every nuxvel app

[Timer]
OnCalendar=*-*-* 02:00:00 UTC
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target'

start_timer() {
  write_file 644 /etc/systemd/system/nuxvel-backup.service "$service"
  write_file 644 /etc/systemd/system/nuxvel-backup.timer "$timer"
  systemctl enable nuxvel-backup.timer
  systemctl restart nuxvel-backup.timer
}

file_is "$helper" "$NUXVEL_BACKUP_HELPER" || change "write $helper" write_file 755 "$helper" "$NUXVEL_BACKUP_HELPER"
file_is /usr/local/lib/nuxvel/restore "$NUXVEL_RESTORE_HELPER" ||
  change "write /usr/local/lib/nuxvel/restore" write_file 755 /usr/local/lib/nuxvel/restore "$NUXVEL_RESTORE_HELPER"
file_is /usr/local/lib/nuxvel/erasure "$NUXVEL_ERASURE_HELPER" ||
  change "write /usr/local/lib/nuxvel/erasure" write_file 755 /usr/local/lib/nuxvel/erasure "$NUXVEL_ERASURE_HELPER"
file_is /etc/systemd/system/nuxvel-backup.service "$service" && file_is /etc/systemd/system/nuxvel-backup.timer "$timer" ||
  change "back up every app each night with the timer nuxvel-backup" start_timer
