user=$NUXVEL_APP
prefix=$NUXVEL_APP:
shared=$NUXVEL_APP_DIR/shared

env_value() {
  sed -n "s/^$1=//p" "$shared/.env" 2>/dev/null
}

set_env() {
  { runuser -u "$NUXVEL_DEPLOY_USER" -- grep -v "^$1=" "$shared/.env" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2"; } | deploy_write "$shared/.env"
}

acl_line() {
  echo "user $user on #$(printf '%s' "$1" | sha256sum | cut -d' ' -f1) ~$prefix* &$prefix* +@all -@dangerous +info"
}

url_password() {
  local url=${1#redis://$user:}
  echo "${url%@*}"
}

has_user() {
  local name=$1 key=$2 password
  password=$(url_password "$(env_value "$key")")
  [ -n "$password" ] && grep -qxF "$(acl_line "$password")" "/etc/redis/$name.acl"
}

create_user() {
  local name=$1 port=$2 key=$3 password acl=/etc/redis/$1.acl
  password=$(openssl rand -hex 32)
  (umask 077 && { grep -v "^user $user " "$acl" || true; acl_line "$password"; } > "$acl.nuxvel-new")
  chown redis:redis "$acl.nuxvel-new"
  chmod 640 "$acl.nuxvel-new"
  mv "$acl.nuxvel-new" "$acl"
  REDISCLI_AUTH=$(cat "/etc/nuxvel/redis-$name.password") redis-cli -p "$port" --user nuxvel --no-auth-warning acl load |
    grep -qx OK
  set_env "$key" "redis://$user:$password@127.0.0.1:$port/0"
}

has_user durable NUXT_REDIS_URL ||
  change "create the Redis user $user on durable for the keys $prefix*, its URL in $shared/.env" create_user durable 6379 NUXT_REDIS_URL
has_user cache NUXT_REDIS_CACHE_URL ||
  change "create the Redis user $user on cache for the keys $prefix*, its URL in $shared/.env" create_user cache 6380 NUXT_REDIS_CACHE_URL
[ "$(env_value NUXT_REDIS_PREFIX)" = "$prefix" ] ||
  change "set NUXT_REDIS_PREFIX=$prefix in $shared/.env" set_env NUXT_REDIS_PREFIX "$prefix"
