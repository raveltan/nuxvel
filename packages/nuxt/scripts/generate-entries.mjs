import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const mapPath = join(rootDir, "src", "public-imports.json");
const entries = JSON.parse(readFileSync(mapPath, "utf8"));

const check = process.argv.includes("--check");

const topics = new Map();
for (const entry of entries) {
  const [, , side, topic] = entry.path.split("/");
  const key = `${side}/${topic}`;
  if (!topics.has(key)) topics.set(key, []);
  topics.get(key).push(entry);
}

function lineFor(specifier, names, typeOnly) {
  const keyword = typeOnly ? "export type" : "export";
  return `${keyword} { ${names.join(", ")} } from "${specifier}";`;
}

function defineRank(names) {
  return names.some((name) => name.startsWith("define")) ? 0 : 1;
}

function kindRank(line) {
  return line.startsWith("export type") ? 1 : 0;
}

const failures = [];
const files = new Map();
for (const [key, topicEntries] of topics) {
  const [side, topic] = key.split("/");
  const seen = new Map();
  for (const entry of topicEntries) {
    const first = seen.get(entry.name);
    const sanctioned = first && [first, entry].some((e) => e.kind === "component") && [first, entry].some((e) => e.kind === "type");
    if (first && first.file !== entry.file && !sanctioned) {
      failures.push(`${key}: ${entry.name} is exported by ${seen.get(entry.name).file} and ${entry.file}`);
    }
    seen.set(entry.name, entry);
  }
  const components = new Map(
    topicEntries.filter((entry) => entry.kind === "component").map((entry) => [entry.name, entry]),
  );
  const lines = [];
  const covered = new Set();
  for (const [name, component] of components) {
    if (topicEntries.some(
      (other) => other.name === name && other.kind === "type" && other.file !== component.file,
    )) {
      const specifier = `../${component.file.replace(/\.vue$/, "")}`;
      lines.push({ names: [name], text: `export * from "${specifier}";`, file: component.file });
      lines.push({ names: [name], text: `export { default as ${name} } from "${specifier}";`, file: component.file });
      covered.add(name);
    }
  }
  for (const entry of topicEntries) {
    if (covered.has(entry.name)) continue;
    const specifier = `../${entry.file.replace(/\.(ts|vue)$/, "")}`;
    const names = topicEntries
      .filter((other) => other.file === entry.file && other.kind === entry.kind && !covered.has(other.name))
      .map((other) => other.name);
    for (const name of names) covered.add(name);
    lines.push({ names, text: entry.kind === "component"
      ? `export { default as ${names[0]} } from "${specifier}";`
      : lineFor(specifier, names, entry.kind === "type"), file: entry.file });
  }
  lines.sort((a, b) =>
    defineRank(a.names) - defineRank(b.names)
    || a.file.localeCompare(b.file)
    || kindRank(a.text) - kindRank(b.text));
  const content = `${lines.map((line) => line.text).join("\n")}\n`;
  files.set(join(rootDir, "src", side, `${topic}.ts`), content);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

for (const [file, content] of files) {
  mkdirSync(dirname(file), { recursive: true });
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== content) {
      console.error(`${relative(rootDir, file)} is out of date; run node scripts/generate-entries.mjs`);
      process.exit(1);
    }
    continue;
  }
  writeFileSync(file, content);
}
console.log(check ? "entries are up to date" : `wrote ${files.size} entry files`);
