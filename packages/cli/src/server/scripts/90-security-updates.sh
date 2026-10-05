periodic='APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";'

dpkg -s unattended-upgrades >/dev/null 2>&1 || change "install unattended-upgrades" apt_install unattended-upgrades
dpkg -s needrestart >/dev/null 2>&1 || change "install needrestart" apt_install needrestart
file_is /etc/apt/apt.conf.d/20auto-upgrades "$periodic" ||
  change "install security updates every day" write_file 644 /etc/apt/apt.conf.d/20auto-upgrades "$periodic"
