major=18
dir=/etc/postgresql/$major/main

config="listen_addresses = 'localhost'
max_connections = 100
password_encryption = 'scram-sha-256'
shared_buffers = $((NUXVEL_POSTGRES_MB / 2))MB
effective_cache_size = $((NUXVEL_RAM_MB / 2))MB
maintenance_work_mem = $((NUXVEL_POSTGRES_MB / 8))MB
shared_preload_libraries = 'pg_stat_statements'
log_min_duration_statement = 500"

hba='local all postgres peer
host all all 127.0.0.1/32 scram-sha-256
host all all ::1/128 scram-sha-256'

configure_postgres() {
  write_file 644 "$dir/conf.d/nuxvel.conf" "$config"
  write_file 640 "$dir/pg_hba.conf" "$hba"
  chown postgres:postgres "$dir/conf.d/nuxvel.conf" "$dir/pg_hba.conf"
  systemctl restart postgresql
}

dpkg -s "postgresql-$major" >/dev/null 2>&1 || change "install Postgres $major" apt_install "postgresql-$major"
file_is "$dir/conf.d/nuxvel.conf" "$config" && file_is "$dir/pg_hba.conf" "$hba" ||
  change "configure Postgres for localhost, password login and a memory budget of $NUXVEL_POSTGRES_MB MB" configure_postgres
