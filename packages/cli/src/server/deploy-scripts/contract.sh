state=$NUXVEL_APP_DIR/state.json
result=$(mktemp)
trap 'rm -f "$result"' EXIT

colors=$(node -e '
const s = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const idle = s.active === "blue" ? "green" : "blue";
console.log([(s.active && s.releases[s.active]) || "-", idle, s.releases[idle] || "-"].join(" "));
' "$state")
set -- $colors
live=$1 idle=$2 idle_release=$3

if [ "$live" = - ]; then
  echo "@no-live"
  exit 0
fi
for name in "$NUXVEL_APP-web-$idle" "$NUXVEL_APP-worker-$idle"; do
  if pm2 describe "$name" </dev/null >/dev/null 2>&1; then
    echo "@older $idle $idle_release"
    exit 0
  fi
done

release=$NUXVEL_APP_DIR/releases/$live
contract=
if [ -d "$release/.output/server/nuxvel/migrations/contract" ]; then
  contract=$(ls "$release/.output/server/nuxvel/migrations/contract" | sed -n 's/\.sql$//p' | paste -sd, -)
fi

cd "$release"
if ! NUXVEL_CONTRACT_MIGRATIONS=$contract NUXVEL_MIGRATE_RESULT=$result node --env-file="$NUXVEL_APP_DIR/shared/.env" --env-file="$NUXVEL_APP_DIR/shared/owner.env" .output/server/nuxvel/migrate.mjs; then
  echo "The contract migrations of $live failed" >&2
  exit 1
fi
node - "$state" "$result" <<'JS'
const { readFileSync, renameSync, writeFileSync } = require("node:fs");
const [file, resultFile] = process.argv.slice(2);
const state = JSON.parse(readFileSync(file, "utf8"));
const result = JSON.parse(readFileSync(resultFile, "utf8") || '{"contract":[],"deferred":[]}');
state.contractMigrations = [...new Set([...state.contractMigrations, ...result.contract])];
writeFileSync(`${file}.nuxvel-new`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
renameSync(`${file}.nuxvel-new`, file);
for (const tag of result.contract) console.log(`~ apply the contract migration ${tag}`);
for (const tag of result.deferred) console.log(`! The contract migration ${tag} waits on a backfill`);
console.log(`@applied ${result.contract.length} ${result.deferred.length}`);
JS
