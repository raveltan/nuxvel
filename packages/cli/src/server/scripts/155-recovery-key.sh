exec 3>&1

make_recovery_key() {
  local identity
  identity=$(age-keygen 2>/dev/null)
  install -d -m 700 /etc/nuxvel
  printf '%s\n' "$identity" | age-keygen -y > /etc/nuxvel/recovery.pub.pending
  echo "recovery-key $(printf '%s\n' "$identity" | grep '^AGE-SECRET-KEY-')" >&3
}

dpkg -s age >/dev/null 2>&1 || change "install age" apt_install age
[ -f /etc/nuxvel/recovery.pub ] || change "make the recovery key" make_recovery_key
