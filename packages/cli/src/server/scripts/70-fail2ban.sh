jail='[sshd]
enabled = true
backend = systemd'

configure_fail2ban() {
  write_file 644 /etc/fail2ban/jail.d/nuxvel.conf "$jail"
  fail2ban-client -t >/dev/null
  systemctl restart fail2ban
}

dpkg -s fail2ban python3-systemd >/dev/null 2>&1 || change "install fail2ban" apt_install fail2ban python3-systemd
file_is /etc/fail2ban/jail.d/nuxvel.conf "$jail" || change "ban repeated failed SSH logins with fail2ban" configure_fail2ban
