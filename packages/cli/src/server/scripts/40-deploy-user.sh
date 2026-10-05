home=/home/$NUXVEL_DEPLOY_USER

if [ ! -s /root/.ssh/authorized_keys ]; then
  echo "root has no SSH key in /root/.ssh/authorized_keys, and password login is about to be turned off" >&2
  echo "Add your key first: ssh-copy-id root@<host>" >&2
  exit 1
fi

keys=$home/.ssh/authorized_keys

missing_root_keys() {
  if [ -f "$keys" ]; then
    grep -vxF -f "$keys" /root/.ssh/authorized_keys || true
  else
    cat /root/.ssh/authorized_keys
  fi | grep -v '^[[:space:]]*$' || true
}

add_keys() {
  install -d -m 700 -o "$NUXVEL_DEPLOY_USER" -g "$NUXVEL_DEPLOY_USER" "$home/.ssh"
  [ ! -s "$keys" ] || [ -z "$(tail -c 1 "$keys")" ] || echo >> "$keys"
  printf '%s\n' "$1" >> "$keys"
  chown "$NUXVEL_DEPLOY_USER:$NUXVEL_DEPLOY_USER" "$keys"
  chmod 600 "$keys"
}

id -u "$NUXVEL_DEPLOY_USER" >/dev/null 2>&1 || change "create the user $NUXVEL_DEPLOY_USER" useradd --create-home --shell /bin/bash "$NUXVEL_DEPLOY_USER"
root_keys=$(missing_root_keys)
[ -z "$root_keys" ] || change "add root's SSH keys to $NUXVEL_DEPLOY_USER" add_keys "$root_keys"
