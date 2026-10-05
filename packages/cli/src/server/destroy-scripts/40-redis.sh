user=$NUXVEL_APP
prefix=$NUXVEL_APP:

admin() {
  REDISCLI_AUTH=$(cat "/etc/nuxvel/redis-$1.password") redis-cli -p "$2" --user nuxvel --no-auth-warning "${@:3}"
}

remove_user() {
  local name=$1 port=$2 acl=/etc/redis/$1.acl
  (umask 077 && { grep -v "^user $user " "$acl" || true; } > "$acl.nuxvel-new")
  chown redis:redis "$acl.nuxvel-new"
  chmod 640 "$acl.nuxvel-new"
  mv "$acl.nuxvel-new" "$acl"
  admin "$name" "$port" acl load | grep -qx OK
  admin "$name" "$port" --scan --pattern "$prefix*" |
    REDISCLI_AUTH=$(cat "/etc/nuxvel/redis-$name.password") xargs -r -d '\n' -n 500 redis-cli -p "$port" --user nuxvel --no-auth-warning unlink >/dev/null
}

for instance in durable:6379 cache:6380; do
  name=${instance%:*}
  port=${instance#*:}
  if grep -q "^user $user " "/etc/redis/$name.acl" || [ -n "$(admin "$name" "$port" --scan --pattern "$prefix*" | head -1)" ]; then
    change "remove the Redis user $user and the keys $prefix* from $name" remove_user "$name" "$port"
  fi
done
