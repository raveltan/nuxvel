version=2.11.4
arch=$(dpkg --print-architecture)

case "$arch" in
  amd64) checksum=1c6f5404f3622e46d401d81f4af59677d46b886229c6694d60fd936b87c72d3bb5d1fcf42b55c8d555769fa75acf434ab618fc7e0df2c79cf8512ee580d38d06 ;;
  arm64) checksum=c43c62b7b583b31c682b3c3e1a31cf03759fbab01dcb0fc7d7fc3a5ce1bef43403583e26133920634a730a9fe31dae1386af4d3f9f3fc19fcc2c29ebf19de235 ;;
esac

caddyfile='{
	admin unix//var/lib/caddy/admin.sock|0600
}
import /etc/caddy/sites/*.caddy'

install_caddy() {
  local package
  package=$(mktemp --suffix=.deb)
  curl -fsSL -o "$package" "https://github.com/caddyserver/caddy/releases/download/v$version/caddy_${version}_linux_$arch.deb"
  echo "$checksum  $package" | sha512sum --check --quiet
  dpkg -i "$package"
  rm "$package"
}

drop_caddy_repository() {
  rm -f /etc/apt/sources.list.d/caddy-stable.list /etc/apt/keyrings/caddy-stable.gpg
}

configure_caddy() {
  install -d -m 755 /etc/caddy/sites
  write_file 644 /etc/caddy/Caddyfile "$caddyfile"
  systemctl restart caddy
}

leave_deploy_group() {
  gpasswd -d caddy "$NUXVEL_DEPLOY_USER"
  systemctl restart caddy
}

[ ! -f /etc/apt/sources.list.d/caddy-stable.list ] || change "remove the Caddy apt repository" drop_caddy_repository
[ "$(dpkg-query -W -f='${Version}' caddy 2>/dev/null)" = "$version" ] || change "install Caddy $version" install_caddy
file_is /etc/caddy/Caddyfile "$caddyfile" || change "serve the app sites in /etc/caddy/sites/ with Caddy" configure_caddy
! id -nG caddy 2>/dev/null | grep -qw "$NUXVEL_DEPLOY_USER" ||
  change "take Caddy out of the group $NUXVEL_DEPLOY_USER" leave_deploy_group
