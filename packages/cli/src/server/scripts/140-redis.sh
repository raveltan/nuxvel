turn_off_default() {
  systemctl disable redis-server
  systemctl stop redis-server
}

create_admin() {
  local name=$1 password
  password=$(openssl rand -hex 32)
  install -d -m 700 /etc/nuxvel
  (umask 077 && printf '%s\n' "$password" > "/etc/nuxvel/redis-$name.password")
  write_file 640 "/etc/redis/$name.acl" "user default off
user nuxvel on #$(printf '%s' "$password" | sha256sum | cut -d' ' -f1) ~* &* +@all"
  chown redis:redis "/etc/redis/$name.acl"
}

configure() {
  local name=$1 config=$2
  write_file 640 "/etc/redis/redis-$name.conf" "$config"
  chown redis:redis "/etc/redis/redis-$name.conf"
  install -d -m 750 -o redis -g redis "/var/lib/redis/$name"
  systemctl enable "redis-server@$name"
  systemctl restart "redis-server@$name"
}

instance() {
  local name=$1 port=$2 settings=$3
  local config="bind 127.0.0.1 -::1
protected-mode yes
port $port
pidfile /run/redis-$name/redis-server.pid
logfile /var/log/redis/redis-$name.log
dir /var/lib/redis/$name
aclfile /etc/redis/$name.acl
maxmemory $((NUXVEL_REDIS_MB / 2))mb
$settings"

  [ -f "/etc/redis/$name.acl" ] || change "create the admin user of Redis $name" create_admin "$name"
  file_is "/etc/redis/redis-$name.conf" "$config" ||
    change "run Redis $name on localhost:$port" configure "$name" "$config"
}

dpkg -s redis-server >/dev/null 2>&1 || change "install Redis" apt_install redis-server
if ! dpkg -s redis-server >/dev/null 2>&1 || systemctl is-enabled -q redis-server 2>/dev/null; then
  change "turn off the default Redis instance" turn_off_default
fi

instance durable 6379 'maxmemory-policy noeviction
appendonly yes
appendfsync everysec'

instance cache 6380 'maxmemory-policy allkeys-lru
appendonly no
save ""'
