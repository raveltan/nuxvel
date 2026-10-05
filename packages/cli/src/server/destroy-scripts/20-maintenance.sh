name=nuxvel-$NUXVEL_APP-maintenance

stop_timer() {
  systemctl disable "$name.timer"
  systemctl stop "$name.timer"
  rm -f "/etc/systemd/system/$name.timer" "/etc/systemd/system/$name.service"
  systemctl daemon-reload
}

[ ! -f "/etc/systemd/system/$name.timer" ] || change "remove the timer $name" stop_timer
