import { readdirSync, readFileSync } from "node:fs";

const helpers = `change() {
  echo "~ $1"
  shift
  [ "$NUXVEL_DRY_RUN" = 1 ] || "$@" >&2
}
file_is() {
  printf '%s\\n' "$2" | cmp -s - "$1"
}
write_file() {
  (umask 077 && printf '%s\\n' "$3" > "$2.nuxvel-new")
  chmod "$1" "$2.nuxvel-new"
  mv "$2.nuxvel-new" "$2"
}
deploy_write() {
  runuser -u "$NUXVEL_DEPLOY_USER" -- sh -c 'umask 077 && rm -f "$1.nuxvel-new" && cat > "$1.nuxvel-new" && mv -T "$1.nuxvel-new" "$1"' sh "$1"
}
apt_install() {
  local output
  output=$(apt-get update -q 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@" 2>&1) || {
    echo "$output"
    return 1
  }
}
`;

export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function shellVariables(values: Record<string, string>) {
  return Object.entries(values).map(([name, value]) => `NUXVEL_${name}=${shellQuote(value)}`);
}

export function shellScriptOf(files: (string | string[])[], variables: string) {
  const scripts = files.map((group) => `(\n${[group].flat().map((file) => readFileSync(file, "utf8")).join("")})\n`);

  return `set -euo pipefail\n${variables}\n${helpers}${scripts.join("")}`;
}

export function shellScript(scriptsDir: string, variables: string) {
  const names = readdirSync(scriptsDir)
    .filter((name) => name.endsWith(".sh"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

  return shellScriptOf(names.map((name) => scriptsDir + name), variables);
}
