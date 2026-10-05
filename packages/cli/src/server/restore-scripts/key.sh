dpkg -s age >/dev/null 2>&1 || apt_install age
install -d -m 700 /etc/nuxvel
public=$(printf '%s\n' "$NUXVEL_RECOVERY_KEY" | age-keygen -y 2>/dev/null) || {
  echo "The recovery key is not an age secret key" >&2
  exit 1
}
if [ ! -f /etc/nuxvel/recovery.pub ]; then
  printf '%s\n' "$public" > /etc/nuxvel/recovery.pub
  echo "~ use the recovery key $public"
elif [ "$(cat /etc/nuxvel/recovery.pub)" != "$public" ]; then
  echo "This server encrypts its backups to the recovery key $(cat /etc/nuxvel/recovery.pub) in /etc/nuxvel/recovery.pub, not to $public, the public key of the key you gave" >&2
  echo "Give the recovery key of the lost server. If this server has no backup yet, remove /etc/nuxvel/recovery.pub, then run server:restore again" >&2
  exit 1
fi
