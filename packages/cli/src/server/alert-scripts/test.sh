if [ ! -x /usr/local/lib/nuxvel/monitor ]; then
  echo "This server has no monitor, /usr/local/lib/nuxvel/monitor is missing" >&2
  echo "Run nuxvel server:setup first" >&2
  exit 1
fi
if ! grep -q -- '"--test"' /usr/local/lib/nuxvel/monitor; then
  echo "The monitor on this server cannot send a test alert, /usr/local/lib/nuxvel/monitor is older than alerts:test" >&2
  echo "Run nuxvel server:setup to update it" >&2
  exit 1
fi
/usr/local/lib/nuxvel/monitor --test
