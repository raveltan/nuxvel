database=${NUXVEL_APP//-/_}

sql() {
  (cd / && runuser -u postgres -- psql -X -q -t -A -v ON_ERROR_STOP=1 "$@")
}

[ "$(sql -c "select 1 from pg_database where datname = '$database'")" != 1 ] ||
  change "drop the database $database" sql -c "DROP DATABASE $database WITH (FORCE)"
for role in $(sql -c "select rolname from pg_roles where rolname ~ '^${database}_app_[0-9]+\$'") "${database}_app" "${database}_owner"; do
  [ "$(sql -c "select 1 from pg_roles where rolname = '$role'")" != 1 ] || change "drop the database role $role" sql -c "DROP ROLE $role"
done
