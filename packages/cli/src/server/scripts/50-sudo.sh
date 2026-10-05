caddy_reload='#!/bin/sh
set -e
if ! output=$(caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1); then
  echo "$output" >&2
  exit 1
fi
systemctl reload caddy'

sudoers_file=/etc/sudoers.d/nuxvel-$NUXVEL_DEPLOY_USER
sudoers="$NUXVEL_DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/lib/nuxvel/caddy-site, /usr/local/lib/nuxvel/erasure, /usr/local/lib/nuxvel/assets"

old_rule_is_ours() {
  case "$(cat /etc/sudoers.d/nuxvel 2>/dev/null)" in "$NUXVEL_DEPLOY_USER "*) return 0 ;; esac
  return 1
}

write_sudoers() {
  printf '%s\n' "$sudoers" > /etc/sudoers.d/.nuxvel
  chmod 440 /etc/sudoers.d/.nuxvel
  visudo -cqf /etc/sudoers.d/.nuxvel
  mv /etc/sudoers.d/.nuxvel "$sudoers_file"
  ! old_rule_is_ours || rm /etc/sudoers.d/nuxvel
}

file_is /usr/local/lib/nuxvel/caddy-reload "$caddy_reload" ||
  change "write /usr/local/lib/nuxvel/caddy-reload" write_file 755 /usr/local/lib/nuxvel/caddy-reload "$caddy_reload"
{ file_is "$sudoers_file" "$sudoers" && ! old_rule_is_ours; } ||
  change "let $NUXVEL_DEPLOY_USER run only caddy-site, erasure and assets in /usr/local/lib/nuxvel/ with sudo" write_sudoers
