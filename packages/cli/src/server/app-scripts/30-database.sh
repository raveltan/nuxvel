database=${NUXVEL_APP//-/_}
owner=${database}_owner
runtime=${database}_app
shared=$NUXVEL_APP_DIR/shared

sql() {
  runuser -u postgres -- psql -X -q -t -A -v ON_ERROR_STOP=1 "$@"
}

is_one() {
  [ "$(sql -c "$1")" = 1 ]
}

has_env() {
  grep -q "^$2=" "$shared/$1" 2>/dev/null
}

set_env() {
  { runuser -u "$NUXVEL_DEPLOY_USER" -- grep -v "^$2=" "$shared/$1" 2>/dev/null || true; printf '%s=%s\n' "$2" "$3"; } | deploy_write "$shared/$1"
}

login_role() {
  local role=$1 file=$2 key=$3 password verb=CREATE
  password=$(openssl rand -hex 32)
  is_one "select 1 from pg_roles where rolname = '$role'" && verb=ALTER
  sql <<SQL
$verb ROLE $role WITH LOGIN PASSWORD '$password';
SQL
  set_env "$file" "$key" "postgres://$role:$password@127.0.0.1:5432/$database"
}

create_database() {
  is_one "select 1 from pg_database where datname = '$database'" || sql -c "CREATE DATABASE $database OWNER $owner"
  sql <<SQL
REVOKE ALL ON DATABASE $database FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE $database TO $runtime;
\connect $database
GRANT USAGE ON SCHEMA public TO $runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE $owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE $owner IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO $runtime;
SQL
}

cd /
sql -c "select 1" >/dev/null

is_one "select 1 from pg_roles where rolname = '$owner'" && has_env owner.env NUXT_DATABASE_OWNER_URL ||
  change "create the database role $owner, its URL in $shared/owner.env" login_role "$owner" owner.env NUXT_DATABASE_OWNER_URL
is_one "select 1 from pg_roles where rolname = '$runtime'" && has_env .env NUXT_DATABASE_URL ||
  change "create the database role $runtime, its URL in $shared/.env" login_role "$runtime" .env NUXT_DATABASE_URL
is_one "select case when exists (select 1 from pg_roles where rolname = '$runtime')
  then (select count(*) from pg_database where datname = '$database' and has_database_privilege('$runtime', datname, 'CONNECT'))
  else 0 end" ||
  change "create the database $database, owned by $owner, with data rights for $runtime" create_database
