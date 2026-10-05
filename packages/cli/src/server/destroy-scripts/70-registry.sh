file=/srv/nuxvel/server.json

remove_entry() {
  local contents
  contents=$(node -e '
const registry = require("/srv/nuxvel/server.json");
delete registry.apps[process.argv[1]];
console.log(JSON.stringify(registry, null, 2));
' "$NUXVEL_APP")
  write_file 644 "$file" "$contents"
}

change "remove $NUXVEL_APP from the server registry $file" remove_entry
