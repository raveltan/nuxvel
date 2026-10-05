if [ ! -f /srv/nuxvel/server.json ]; then
  echo "This server is not set up by nuxvel, /srv/nuxvel/server.json is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
upgradable() {
  apt-get -s -q dist-upgrade 2>/dev/null | awk '/^Inst / && /-security/ { print $2 }'
}
install_updates() {
  local output
  output=$(DEBIAN_FRONTEND=noninteractive unattended-upgrade 2>&1) || {
    echo "$output"
    return 1
  }
}
output=$(apt-get update -q 2>&1) || {
  echo "$output" >&2
  exit 1
}
packages=$(upgradable | sort -u | tr '\n' ' ')
if [ -n "$packages" ]; then
  change "install the security updates of ${packages% }" install_updates
fi
for service in $(needrestart -b -r l 2>/dev/null | sed -n 's/^NEEDRESTART-SVC: //p'); do
  case "$service" in
    pm2-*) echo "! Node.js or a library of the app processes changed: they pick it up on the next deploy" ;;
    dbus* | systemd-* | getty@* | serial-getty@* | user@* | unattended-upgrades* | apt-daily* | cloud-* | network* | NetworkManager* | rc-local.service | cron-*)
      echo "! $service uses an old library but is not safe to restart: it picks up the update with the next reboot" ;;
    *) change "restart $service" systemctl restart "$service" ;;
  esac
done
if [ -f /var/run/reboot-required ]; then
  if [ "$NUXVEL_REBOOT" = 1 ]; then
    change "reboot the server in 5 seconds" systemd-run --on-active=5 systemctl reboot
  else
    echo "@reboot-required $(sort -u /var/run/reboot-required.pkgs 2>/dev/null | tr '\n' ' ')"
  fi
fi
