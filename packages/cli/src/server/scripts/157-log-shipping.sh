config=/etc/vector/vector.yaml

install_vector() {
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://keys.datadoghq.com/DATADOG_APT_KEY_CURRENT.public | gpg --dearmor --yes -o /etc/apt/keyrings/vector.gpg
  echo "deb [signed-by=/etc/apt/keyrings/vector.gpg] https://apt.vector.dev/ stable vector-0" > /etc/apt/sources.list.d/vector.list
  apt_install vector
}

vector_config() {
  node - "$NUXVEL_DEPLOY_USER" "$NUXVEL_LOG_SINK" <<'JS'
const [user, sink] = process.argv.slice(2);
const config = {
  data_dir: "/var/lib/vector",
  sources: {
    pm2: { type: "file", include: [`/home/${user}/.pm2/logs/*.log`] },
    caddy: { type: "file", include: ["/var/log/caddy/*.access.log"] },
    monitor: { type: "file", include: ["/var/log/nuxvel/monitor.log"] },
  },
  transforms: {
    parsed: {
      type: "remap",
      inputs: ["pm2", "caddy", "monitor"],
      source: "parsed, err = parse_json(.message)\nif err == null && is_object(parsed) { . = merge(., object!(parsed)) }",
    },
  },
  sinks: { sink: { ...JSON.parse(sink), inputs: ["parsed"] } },
};
console.log(`# Written by nuxvel server:setup from logs.sink in nuxvel.deploy.ts\n${JSON.stringify(config, null, 2)}`);
JS
}

ship_logs() {
  local check=/etc/vector/vector.nuxvel-check.yaml
  write_file 640 "$check" "$1"
  chown root:vector "$check"
  if ! output=$(vector validate --no-environment "$check" 2>&1); then
    rm "$check"
    echo "Vector refused logs.sink of nuxvel.deploy.ts:" >&2
    echo "$output" >&2
    return 1
  fi
  mv "$check" "$config"
  usermod -aG "$NUXVEL_DEPLOY_USER" vector
  systemctl enable vector
  systemctl restart vector
}

if [ -n "$NUXVEL_LOG_SINK" ]; then
  [ -f /etc/apt/sources.list.d/vector.list ] && dpkg -s vector >/dev/null 2>&1 || change "install Vector" install_vector
  if command -v node >/dev/null; then
    contents=$(vector_config)
    file_is "$config" "$contents" || change "ship the pm2, Caddy and monitor logs with Vector to a $(printf '%s' "$NUXVEL_LOG_SINK" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).type') sink" ship_logs "$contents"
  else
    change "ship the pm2, Caddy and monitor logs with Vector" true
  fi
fi
