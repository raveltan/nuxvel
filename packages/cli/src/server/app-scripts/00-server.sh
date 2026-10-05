if [ ! -f /srv/nuxvel/server.json ]; then
  echo "This server is not set up by nuxvel, /srv/nuxvel/server.json is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
