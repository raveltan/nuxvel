node - "$NUXVEL_APP_DIR" <<'JS'
const { existsSync, readdirSync, readFileSync } = require("node:fs");
const [dir] = process.argv.slice(2);
if (!existsSync(`${dir}/state.json`)) {
  console.log("@missing");
  process.exit(0);
}
const state = JSON.parse(readFileSync(`${dir}/state.json`, "utf8"));
const releases = readdirSync(`${dir}/releases`, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => {
    let manifest = {};
    try {
      manifest = JSON.parse(readFileSync(`${dir}/releases/${name}/nuxvel-manifest.json`, "utf8"));
    } catch {}
    const colors = Object.entries(state.releases).filter(([, release]) => release === name).map(([color]) => color);
    return { name, commit: manifest.commit ?? null, source: manifest.source ?? null, colors, live: colors.includes(state.active) };
  })
  .sort((a, b) => b.name.localeCompare(a.name));
console.log(`@active ${state.active}`);
console.log(`@releases ${JSON.stringify(releases)}`);
JS
