config='PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no'

configure_ssh() {
  write_file 644 /etc/ssh/sshd_config.d/00-nuxvel.conf "$config"
  sshd -t
  systemctl try-reload-or-restart ssh
}

file_is /etc/ssh/sshd_config.d/00-nuxvel.conf "$config" ||
  change "allow SSH with keys only, and root with a key only" configure_ssh
