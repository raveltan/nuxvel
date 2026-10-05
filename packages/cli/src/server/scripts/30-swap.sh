create_swapfile() {
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
}

[ -f /swapfile ] || change "create a 2 GB swap file" create_swapfile
grep -q '^/swapfile ' /etc/fstab || change "add /swapfile to /etc/fstab" sh -c 'echo "/swapfile none swap sw 0 0" >> /etc/fstab'
swapon --show=NAME --noheadings | grep -qx /swapfile || change "turn on /swapfile" swapon /swapfile
