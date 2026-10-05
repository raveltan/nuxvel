version=4.47
arch=$(dpkg --print-architecture)

case "$arch" in
  amd64) checksum=31fb804858885f9e7f18b6d3b1da09e824baac3e6a55b5a62c3c4c77e6ed6d7d ;;
  arm64) checksum=ba5c9def9ff98f78becdf309a50a9f906922f6383a7c4c772d01ede3cc012e16 ;;
esac

unit='[Unit]
Description=SeaweedFS
After=network.target

[Service]
User=seaweedfs
Group=seaweedfs
EnvironmentFile=/etc/nuxvel/seaweedfs.env
ExecStartPre=+/usr/sbin/nft -f /etc/nuxvel/seaweedfs.nft
ExecStart=/usr/local/bin/weed server -dir=/srv/nuxvel/storage -ip=127.0.0.1 -ip.bind=127.0.0.1 -master.volumeSizeLimitMB=1024 -volume.max=0 -s3 -s3.port=8333
Restart=on-failure
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target'

rules='table inet nuxvel_seaweedfs
delete table inet nuxvel_seaweedfs
table inet nuxvel_seaweedfs {
	chain output {
		type filter hook output priority filter; policy accept;
		meta skuid { 0, seaweedfs } accept
		oif "lo" tcp dport { 8080, 8181, 8888, 9101, 9333, 18080, 18333, 18888, 19333 } reject with tcp reset
	}
}'

install_weed() {
  local archive
  archive=$(mktemp)
  curl -fsSL -o "$archive" "https://github.com/seaweedfs/seaweedfs/releases/download/$version/linux_$arch.tar.gz"
  echo "$checksum  $archive" | sha256sum --check --quiet
  tar -xzf "$archive" -C /usr/local/bin weed
  rm "$archive"
  systemctl try-restart seaweedfs
}

growth='[master.volume_growth]
copy_1 = 1'

grow_by_one() {
  install -d -m 755 /etc/seaweedfs
  write_file 644 /etc/seaweedfs/master.toml "$growth"
  systemctl try-restart seaweedfs
}

install_rules() {
  install -d -m 700 /etc/nuxvel
  write_file 644 /etc/nuxvel/seaweedfs.nft "$rules"
  systemctl try-restart seaweedfs
}

create_user() {
  useradd --system --home-dir /srv/nuxvel/storage --shell /usr/sbin/nologin seaweedfs
  install -d -m 700 -o seaweedfs -g seaweedfs /srv/nuxvel/storage
}

create_admin() {
  install -d -m 700 /etc/nuxvel
  (umask 077 && printf 'AWS_ACCESS_KEY_ID=%s\nAWS_SECRET_ACCESS_KEY=%s\n' "$(openssl rand -hex 10)" "$(openssl rand -hex 32)" > /etc/nuxvel/seaweedfs.env)
}

start_on_boot() {
  write_file 644 /etc/systemd/system/seaweedfs.service "$unit"
  systemctl enable seaweedfs
  systemctl restart seaweedfs
}

lifecycle_service='[Unit]
Description=Run the lifecycle rules of every SeaweedFS bucket
After=seaweedfs.service

[Service]
Type=oneshot
User=seaweedfs
Group=seaweedfs
ExecStart=/usr/local/bin/weed shell -master=127.0.0.1:9333
StandardInput=data
StandardInputText=s3.lifecycle.run-shard -shards 0-15 -s3 127.0.0.1:18333 -events 0'

lifecycle_timer='[Unit]
Description=Run the lifecycle rules of every SeaweedFS bucket, every hour

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target'

run_lifecycle() {
  write_file 644 /etc/systemd/system/nuxvel-storage-lifecycle.service "$lifecycle_service"
  write_file 644 /etc/systemd/system/nuxvel-storage-lifecycle.timer "$lifecycle_timer"
  systemctl enable nuxvel-storage-lifecycle.timer
  systemctl restart nuxvel-storage-lifecycle.timer
}

/usr/local/bin/weed version 2>/dev/null | grep -q " $version " || change "install SeaweedFS $version" install_weed
id -u seaweedfs >/dev/null 2>&1 || change "create the user seaweedfs with its data in /srv/nuxvel/storage" create_user
[ -f /etc/nuxvel/seaweedfs.env ] || change "create the S3 admin keys of SeaweedFS" create_admin
file_is /etc/seaweedfs/master.toml "$growth" || change "give each new bucket of SeaweedFS one volume" grow_by_one
dpkg -s nftables >/dev/null 2>&1 || change "install nftables" apt_install nftables
file_is /etc/nuxvel/seaweedfs.nft "$rules" || change "let only root and seaweedfs reach the SeaweedFS filer, volume and master on localhost" install_rules
file_is /etc/systemd/system/seaweedfs.service "$unit" || change "run SeaweedFS with S3 on localhost:8333" start_on_boot
file_is /etc/systemd/system/nuxvel-storage-lifecycle.service "$lifecycle_service" &&
  file_is /etc/systemd/system/nuxvel-storage-lifecycle.timer "$lifecycle_timer" ||
  change "delete the expired files of every bucket each hour with the timer nuxvel-storage-lifecycle" run_lifecycle
