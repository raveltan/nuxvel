current=$(env_value .env NUXT_DATABASE_URL | sed -n 's|^postgres://\([^:]*\):.*|\1|p')
key=$(storage_key)
roles=$(sql -c "select rolname from pg_roles where rolcanlogin and (rolname = '$runtime' or rolname ~ '^${runtime}_[0-9]+\$')")
keys=$(weed_shell "s3.accesskey.list -user $user" | awk 'NR > 1 && $1 != "" { print $1 }')
if ! grep -qxF "$current" <<<"$roles"; then
  echo "NUXT_DATABASE_URL in $shared/.env names no login role of $runtime. Nothing is revoked." >&2
  exit 1
fi
if ! grep -qxF "$key" <<<"$keys"; then
  echo "NUXT_STORAGE_URL in $shared/.env names no S3 key of the S3 user $user. Nothing is revoked." >&2
  exit 1
fi

terminate() {
  sql -c "select pg_terminate_backend(pid) from pg_stat_activity where usename = '$1'" >/dev/null
}

turn_off_login() {
  sql -c "ALTER ROLE $runtime WITH NOLOGIN PASSWORD NULL"
  terminate "$runtime"
}

drop_login() {
  sql -c "ALTER ROLE $1 WITH NOLOGIN"
  terminate "$1"
  sql -c "DROP ROLE $1"
}

for role in $roles; do
  [ "$role" != "$current" ] || continue
  if [ "$role" = "$runtime" ]; then
    change "turn off the login of the database role $runtime" turn_off_login
  else
    change "drop the database role $role" drop_login "$role"
  fi
done

for instance in "durable 6379 NUXT_REDIS_URL" "cache 6380 NUXT_REDIS_CACHE_URL"; do
  set -- $instance
  line=$(acl_line "#$(hash "$(url_password "$(env_value .env "$3")")")")
  grep -qxF "$line" "/etc/redis/$1.acl" ||
    change "remove the old password of the Redis user $user on $1" load_acl "$1" "$2" "$line"
done

for old in $keys; do
  [ "$old" != "$key" ] || continue
  change "delete the old S3 key $old of the S3 user $user" weed_shell "s3.accesskey.delete -user $user -access_key $old"
done
