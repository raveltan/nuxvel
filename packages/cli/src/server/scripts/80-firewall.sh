dpkg -s ufw >/dev/null 2>&1 || change "install ufw" apt_install ufw
grep -qx 'DEFAULT_INPUT_POLICY="DROP"' /etc/default/ufw || change "deny incoming traffic by default" ufw default deny incoming

ssh_connection=${SSH_CONNECTION:-22}

for port in "${ssh_connection##* }" 80 443; do
  ufw show added | grep -qx "ufw allow $port/tcp" || change "allow port $port in the firewall" ufw allow "$port/tcp"
done

ufw status | grep -qx "Status: active" || change "turn on the firewall" ufw --force enable
