install_node() {
  install -d -m 755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NUXVEL_NODE_MAJOR.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt_install nodejs
}

installed=$(node --version 2>/dev/null | cut -d. -f1 | tr -d v) || true
if [ -n "$installed" ] && [ "$installed" -gt "$NUXVEL_NODE_MAJOR" ]; then
  echo "This server runs Node.js $installed and .nvmrc sets $NUXVEL_NODE_MAJOR. nuxvel does not install an older Node.js major" >&2
  echo "Set .nvmrc to $installed or higher, or remove Node.js from the server yourself" >&2
  exit 1
fi
[ "$installed" = "$NUXVEL_NODE_MAJOR" ] || change "install Node.js $NUXVEL_NODE_MAJOR" install_node
