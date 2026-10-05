release=$NUXVEL_APP_DIR/releases/$NUXVEL_RELEASE
shared=$NUXVEL_APP_DIR/shared
state=$NUXVEL_APP_DIR/state.json
result=$(mktemp)
trap 'rm -f "$result"' EXIT

live=$(node -e 'const s = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(s.active ? s.releases[s.active] ?? "" : "")' "$state")
contract=
live_contract=$NUXVEL_APP_DIR/releases/$live/.output/server/nuxvel/migrations/contract
if [ -n "$live" ] && [ -d "$live_contract" ]; then
  contract=$(ls "$live_contract" | sed -n 's/\.sql$//p' | paste -sd, -)
fi

cd "$release"
if ! NUXVEL_CONTRACT_MIGRATIONS=$contract NUXVEL_MIGRATE_RESULT=$result node --env-file="$shared/.env" --env-file="$shared/owner.env" .output/server/nuxvel/migrate.mjs; then
  cd /
  rm -rf "$release"
  echo "The migrations of $NUXVEL_RELEASE failed: the live release keeps serving, nothing is switched" >&2
  exit 1
fi
node - "$state" "$result" "$contract" <<'JS'
const { readFileSync, renameSync, writeFileSync } = require("node:fs");
const [file, resultFile, live] = process.argv.slice(2);
const inLive = live.split(",");
const state = JSON.parse(readFileSync(file, "utf8"));
const result = JSON.parse(readFileSync(resultFile, "utf8") || '{"contract":[],"deferred":[]}');
state.contractMigrations = [...new Set([...state.contractMigrations, ...result.contract])];
writeFileSync(`${file}.nuxvel-new`, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
renameSync(`${file}.nuxvel-new`, file);
for (const tag of result.contract) console.log(`~ apply the contract migration ${tag}, which the live release already contains`);
for (const tag of result.deferred) {
  if (inLive.includes(tag)) console.log(`! The contract migration ${tag} waits on a backfill: it runs once the backfill completed`);
  else console.log(`! Deferred the contract migration ${tag}: it runs once no older release runs`);
}
JS
