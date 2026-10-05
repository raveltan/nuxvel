. /etc/os-release

if [ "$ID $VERSION_ID" != "ubuntu 26.04" ]; then
  echo "nuxvel sets up Ubuntu 26.04, this server runs $PRETTY_NAME" >&2
  exit 1
fi

server_arch=$(dpkg --print-architecture)
if [ "$server_arch" != "$NUXVEL_ARCH" ]; then
  echo "nuxvel.deploy.ts sets arch to $NUXVEL_ARCH, this server runs $server_arch" >&2
  exit 1
fi
