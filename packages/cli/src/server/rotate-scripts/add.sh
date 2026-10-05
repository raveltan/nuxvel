stamp=$(date -u +%Y%m%d%H%M%S)
login=${runtime}_$stamp

new_owner_password() {
  local password
  password=$(openssl rand -hex 32)
  sql <<SQL
ALTER ROLE $owner WITH PASSWORD '$password';
SQL
  set_env owner.env NUXT_DATABASE_OWNER_URL "postgres://$owner:$password@127.0.0.1:5432/$database"
}

new_login() {
  local password
  password=$(openssl rand -hex 32)
  sql <<SQL
CREATE ROLE $login WITH LOGIN PASSWORD '$password' IN ROLE $runtime;
SQL
  set_env .env NUXT_DATABASE_URL "postgres://$login:$password@127.0.0.1:5432/$database"
}

second_redis_password() {
  local name=$1 port=$2 key=$3 old new
  old=$(grep "^user $user " "/etc/redis/$name.acl" | grep -o '#[0-9a-f]\{64\}')
  new=$(openssl rand -hex 32)
  load_acl "$name" "$port" "$(acl_line $old "#$(hash "$new")")"
  set_env .env "$key" "redis://$user:$new@127.0.0.1:$port/0"
}

second_storage_key() {
  local key secret
  key=$(openssl rand -hex 10)
  secret=$(openssl rand -hex 32)
  weed_shell "s3.accesskey.create -user $user -access_key $key -secret_key $secret" >/dev/null
  for _ in $(seq 50); do
    if printf 'user = "%s"\n' "$key:$secret" | curl -fsS -o /dev/null --aws-sigv4 aws:amz:us-east-1:s3 -K - "http://127.0.0.1:8333/$user-private" 2>/dev/null; then
      set_env .env NUXT_STORAGE_URL "http://$key:$secret@127.0.0.1:8333"
      return
    fi
    sleep 0.2
  done
  echo "SeaweedFS did not accept the new keys of $user" >&2
  return 1
}

change "give the database role $owner a new password, in $shared/owner.env" new_owner_password
change "create the database role $login in $runtime, its URL in $shared/.env" new_login
change "add a second password to the Redis user $user on durable, its URL in $shared/.env" second_redis_password durable 6379 NUXT_REDIS_URL
change "add a second password to the Redis user $user on cache, its URL in $shared/.env" second_redis_password cache 6380 NUXT_REDIS_CACHE_URL
change "add a second S3 key to the S3 user $user, its URL in $shared/.env" second_storage_key
