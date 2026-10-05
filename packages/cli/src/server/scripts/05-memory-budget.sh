cpus=$(nproc)

echo "Memory budget of $NUXVEL_RAM_MB MB: Postgres $NUXVEL_POSTGRES_MB MB, Redis $NUXVEL_REDIS_MB MB, SeaweedFS and Caddy $NUXVEL_SERVICES_MB MB, app processes $NUXVEL_APPS_MB MB"

if [ "$cpus" -lt 2 ] || [ "$NUXVEL_RAM_MB" -lt 3500 ]; then
  echo "! This server has $cpus vCPU and $NUXVEL_RAM_MB MB of RAM, nuxvel recommends at least 2 vCPU and 4 GB of RAM"
fi
