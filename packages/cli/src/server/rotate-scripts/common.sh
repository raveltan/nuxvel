database=${NUXVEL_APP//-/_}
owner=${database}_owner
runtime=${database}_app
user=$NUXVEL_APP
prefix=$NUXVEL_APP:
shared=$NUXVEL_APP_DIR/shared

if [ ! -f "$shared/.env" ]; then
  echo "$NUXVEL_APP is not on this server, $shared/.env is missing" >&2
  exit 1
fi

set -a
. /etc/nuxvel/seaweedfs.env
set +a

sql() {
  (cd / && runuser -u postgres -- psql -X -q -t -A -v ON_ERROR_STOP=1 "$@")
}

env_value() {
  sed -n "s/^$2=//p" "$shared/$1" 2>/dev/null
}

set_env() {
  { runuser -u "$NUXVEL_DEPLOY_USER" -- grep -v "^$2=" "$shared/$1" 2>/dev/null || true; printf '%s=%s\n' "$2" "$3"; } | deploy_write "$shared/$1"
}

url_password() {
  local url=${1#redis://$user:}
  echo "${url%@*}"
}

hash() {
  printf '%s' "$1" | sha256sum | cut -d' ' -f1
}

load_acl() {
  local name=$1 port=$2 line=$3 acl=/etc/redis/$1.acl
  (umask 077 && { grep -v "^user $user " "$acl" || true; echo "$line"; } > "$acl.nuxvel-new")
  chown redis:redis "$acl.nuxvel-new"
  chmod 640 "$acl.nuxvel-new"
  mv "$acl.nuxvel-new" "$acl"
  REDISCLI_AUTH=$(cat "/etc/nuxvel/redis-$name.password") redis-cli -p "$port" --user nuxvel --no-auth-warning acl load |
    grep -qx OK
}

acl_line() {
  echo "user $user on $* ~$prefix* &$prefix* +@all -@dangerous +info"
}

weed_shell() {
  local output
  output=$(printf '%s\n' "$@" | /usr/local/bin/weed shell -master=127.0.0.1:9333 2>&1) || {
    echo "$output" >&2
    return 1
  }
  if grep -q '^error' <<<"$output"; then
    echo "$output" >&2
    return 1
  fi
  echo "$output"
}

storage_key() {
  local url
  url=$(env_value .env NUXT_STORAGE_URL)
  url=${url#http://}
  echo "${url%%:*}"
}
