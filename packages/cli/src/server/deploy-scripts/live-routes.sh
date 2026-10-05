live=$(node -e 'const s = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(s.active ? s.releases[s.active] ?? "" : "")' "$NUXVEL_APP_DIR/state.json" 2>/dev/null)
if [ -z "$live" ]; then
  echo "@no-live"
  exit 0
fi
file=$NUXVEL_APP_DIR/releases/$live/nuxvel-routes.json
if [ -f "$file" ]; then
  cat "$file"
else
  echo "@missing $live"
fi
