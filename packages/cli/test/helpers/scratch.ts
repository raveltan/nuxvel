import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, onTestFinished } from "vitest";

export const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
export const playgroundDir = join(repoRoot, "playground");
export const repoNodeModules = join(repoRoot, "node_modules");

const templateDir = join(repoRoot, "packages", "create", "template");
const playgroundOutputs = new Set([".output", ".nuxvel", ".data", ".env", ".nuxtrc", "node_modules"]);
const nuxtTestBuilds = join(playgroundDir, ".nuxt", "test");

export function removeScratch(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

export function scratchDir(label: string) {
  const dir = mkdtempSync(join(repoRoot, `.nuxvel-test-${label}-`));

  onTestFinished(() => removeScratch(dir));

  return dir;
}

export function outsideRepoDir(label: string) {
  const dir = mkdtempSync(join(tmpdir(), `nuxvel-test-${label}-`));

  onTestFinished(() => removeScratch(dir));

  return dir;
}

export function linkNodeModules(dir: string) {
  symlinkSync(repoNodeModules, join(dir, "node_modules"));
}

export function nodeOnlyPath(dir: string) {
  const bin = join(dir, ".node-only-bin");

  mkdirSync(bin);
  symlinkSync(process.execPath, join(bin, "node"));

  return bin;
}

export function scratchPlayground(label: string) {
  const dir = scratchDir(label);

  copyPlayground(dir);

  return dir;
}

export function sharedPlayground(label: string) {
  const dir = mkdtempSync(join(repoRoot, `.nuxvel-test-${label}-`));

  copyPlayground(dir);
  afterAll(() => removeScratch(dir));

  return dir;
}

export function copyPlayground(dir: string) {
  cpSync(playgroundDir, dir, {
    recursive: true,
    filter: (source) => {
      const name = basename(source);
      return (
        source === playgroundDir ||
        !(playgroundOutputs.has(name) || name.startsWith(".nuxvel-test") || source === nuxtTestBuilds)
      );
    },
  });
  linkNodeModules(dir);
}

export function addTemplateTestSetup(appDir: string) {
  cpSync(join(templateDir, "vitest.config.ts"), join(appDir, "vitest.config.ts"));
  cpSync(join(templateDir, "tests", "setup"), join(appDir, "tests", "setup"), { recursive: true });

  const templateImports = JSON.parse(readFileSync(join(templateDir, "package.json"), "utf-8")).imports;
  const manifestPath = join(appDir, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, imports: { ...manifest.imports, ...templateImports } }, null, 2)}\n`);
}

export function directorySnapshot(dir: string) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const stats = statSync(path);
      return `${name} ${stats.mtimeMs} ${stats.isFile() ? readFileSync(path, "base64") : ""}`;
    });
}
