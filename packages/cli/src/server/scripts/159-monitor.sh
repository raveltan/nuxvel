helper=/usr/local/lib/nuxvel/monitor

service='[Unit]
Description=nuxvel monitor of the server and its apps

[Service]
Type=oneshot
ExecStart=/usr/local/lib/nuxvel/monitor'

timer='[Unit]
Description=nuxvel monitor of the server and its apps, every minute

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target'

metrics_service='[Unit]
Description=Prometheus metrics of the nuxvel monitor on 127.0.0.1:9470

[Service]
ExecStart=/usr/bin/node /usr/local/lib/nuxvel/metrics
DynamicUser=yes
Restart=always

[Install]
WantedBy=multi-user.target'

logrotate='/var/log/nuxvel/*.log {
  weekly
  rotate 8
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}'

serve_metrics() {
  write_file 755 /usr/local/lib/nuxvel/metrics "$NUXVEL_METRICS_HELPER"
  write_file 644 /etc/systemd/system/nuxvel-metrics.service "$metrics_service"
  systemctl enable nuxvel-metrics
  systemctl restart nuxvel-metrics
}

send_alerts() {
  (umask 077 && printf '%s\n' "$NUXVEL_ALERTS" > /etc/nuxvel/alerts.json)
}

start_timer() {
  write_file 644 /etc/systemd/system/nuxvel-monitor.service "$service"
  write_file 644 /etc/systemd/system/nuxvel-monitor.timer "$timer"
  systemctl enable nuxvel-monitor.timer
  systemctl restart nuxvel-monitor.timer
}

file_is "$helper" "$NUXVEL_MONITOR_HELPER" || change "write $helper" write_file 755 "$helper" "$NUXVEL_MONITOR_HELPER"
file_is /etc/systemd/system/nuxvel-monitor.service "$service" && file_is /etc/systemd/system/nuxvel-monitor.timer "$timer" ||
  change "watch the server and its apps every minute with the timer nuxvel-monitor" start_timer
file_is /etc/logrotate.d/nuxvel "$logrotate" || change "rotate the logs in /var/log/nuxvel weekly" write_file 644 /etc/logrotate.d/nuxvel "$logrotate"
file_is /usr/local/lib/nuxvel/metrics "$NUXVEL_METRICS_HELPER" && file_is /etc/systemd/system/nuxvel-metrics.service "$metrics_service" ||
  change "serve the Prometheus metrics of the monitor on 127.0.0.1:9470" serve_metrics
if [ -n "$NUXVEL_ALERTS" ]; then
  file_is /etc/nuxvel/alerts.json "$NUXVEL_ALERTS" || change "send the alerts to $NUXVEL_ALERT_CHANNELS" send_alerts
fi
