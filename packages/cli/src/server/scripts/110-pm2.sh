home=/home/$NUXVEL_DEPLOY_USER

unit="[Unit]
Description=pm2 of $NUXVEL_DEPLOY_USER
After=network.target

[Service]
Type=forking
User=$NUXVEL_DEPLOY_USER
LimitNOFILE=infinity
Environment=PM2_HOME=$home/.pm2
PIDFile=$home/.pm2/pm2.pid
Restart=on-failure
ExecStart=/usr/bin/pm2 resurrect
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 kill

[Install]
WantedBy=multi-user.target"

logrotate="$home/.pm2/logs/*.log {
  su $NUXVEL_DEPLOY_USER $NUXVEL_DEPLOY_USER
  daily
  rotate 14
  compress
  delaycompress
  missingok
  notifempty
  copytruncate
}"

start_on_boot() {
  write_file 644 "/etc/systemd/system/pm2-$NUXVEL_DEPLOY_USER.service" "$unit"
  systemctl enable "pm2-$NUXVEL_DEPLOY_USER"
}

command -v pm2 >/dev/null || change "install pm2" npm install --global pm2@6
file_is "/etc/systemd/system/pm2-$NUXVEL_DEPLOY_USER.service" "$unit" ||
  change "start pm2 as $NUXVEL_DEPLOY_USER on boot" start_on_boot
dpkg -s logrotate >/dev/null 2>&1 || change "install logrotate" apt_install logrotate
file_is "/etc/logrotate.d/pm2-$NUXVEL_DEPLOY_USER" "$logrotate" ||
  change "rotate the pm2 logs daily" write_file 644 "/etc/logrotate.d/pm2-$NUXVEL_DEPLOY_USER" "$logrotate"
