[ "$NUXVEL_FINAL_BACKUP" = 1 ] || exit 0
database=${NUXVEL_APP//-/_}
folder=/srv/nuxvel/backups/$NUXVEL_APP
file=$folder/final-$(date -u +%Y%m%dT%H%M%SZ).tar.age

copy_bucket() {
  node - "$1" "$2" <<'JS'
const { mkdirSync, writeFileSync } = require("node:fs");
const { dirname, join, normalize } = require("node:path");
const [bucket, target] = process.argv.slice(2);
const filer = "http://127.0.0.1:8888";
const root = `/buckets/${bucket}`;
const isFolder = (mode) => Math.floor(mode / 2 ** 31) % 2 === 1;
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

async function copy(path) {
  let last = "";
  for (;;) {
    const url = `${filer}${encodePath(path)}/?limit=1000&lastFileName=${encodeURIComponent(last)}`;
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (response.status === 404) return;
    if (!response.ok) throw new Error(`the filer answered ${response.status} to ${url}`);
    const listing = await response.json();
    for (const entry of listing.Entries ?? []) {
      // The filer keeps an entry named "." or ".." made through its gRPC API
      if (normalize(entry.FullPath) !== entry.FullPath || dirname(entry.FullPath) !== path) continue;
      if (isFolder(entry.Mode)) {
        await copy(entry.FullPath);
        continue;
      }
      const file = join(target, entry.FullPath.slice(root.length));
      mkdirSync(dirname(file), { recursive: true });
      const download = await fetch(`${filer}${encodePath(entry.FullPath)}`);
      if (!download.ok) throw new Error(`the filer answered ${download.status} to ${entry.FullPath}`);
      writeFileSync(file, Buffer.from(await download.arrayBuffer()));
    }
    if (!listing.ShouldDisplayLoadMore) return;
    last = listing.LastFileName;
  }
}

mkdirSync(target, { recursive: true });
copy(root).catch((error) => {
  console.error(error);
  process.exit(1);
});
JS
}

make_backup() {
  local stage
  stage=$(mktemp -d)
  node -e 'console.log(JSON.stringify(require("/srv/nuxvel/server.json").apps[process.argv[1]], null, 2))' "$NUXVEL_APP" > "$stage/app.json"
  install -d "$stage/shared"
  [ ! -d "$NUXVEL_APP_DIR/shared" ] || find "$NUXVEL_APP_DIR/shared" -maxdepth 1 -type f -exec cp -a -t "$stage/shared" {} +
  if [ "$(cd / && runuser -u postgres -- psql -X -tAc "select 1 from pg_database where datname = '$database'")" = 1 ]; then
    (cd / && runuser -u postgres -- pg_dump -Fc "$database") > "$stage/database.dump"
  fi
  copy_bucket "$NUXVEL_APP-private" "$stage/buckets/$NUXVEL_APP-private"
  copy_bucket "$NUXVEL_APP-public" "$stage/buckets/$NUXVEL_APP-public"
  install -d -m 700 /srv/nuxvel/backups "$folder"
  tar -C "$stage" -c . | age -R /etc/nuxvel/recovery.pub -o "$file"
  chmod 600 "$file"
  rm -rf "$stage"
}

change "make the final backup $file, encrypted to the recovery key" make_backup
