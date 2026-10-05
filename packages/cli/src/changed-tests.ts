import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

interface Changes {
  hashes: Record<string, string>;
  map: Record<string, string[]>;
  failed: string[];
}

const RUN_ALL =
  /^(nuxt\.config\.ts|package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|vitest\.config\.ts|tsconfig\.json|\.env|tests\/setup\/.+)$|(^|\/)server\/database\/migrations\//;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

export function skipsFolder(name: string) {
  return name.startsWith(".") || name === "node_modules" || name === "dist";
}

function projectFiles(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return skipsFolder(entry.name) ? [] : projectFiles(path, root);
    }
    return entry.isFile() ? [relative(root, path)] : [];
  });
}

function hashOf(path: string) {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

export function selectChangedTests(cwd: string): { runAll: string } | { files: string[]; replayed: number } {
  const changesFile = join(cwd, "node_modules", ".cache", "nuxvel", "changes.json");

  if (process.env.CI) return { runAll: "CI is set" };
  if (!existsSync(changesFile)) return { runAll: "there is no record of a previous run" };

  const { hashes, map, failed } = JSON.parse(readFileSync(changesFile, "utf8")) as Changes;
  const current = Object.fromEntries(projectFiles(cwd).map((file) => [file, hashOf(join(cwd, file))]));
  const changed = [...new Set([...Object.keys(hashes), ...Object.keys(current)])]
    .filter((file) => hashes[file] !== current[file] && !file.startsWith("tests/e2e/"))
    .sort();

  const configFile = changed.find((file) => RUN_ALL.test(file));
  if (configFile) return { runAll: `${configFile} changed` };

  const ranFiles = new Set(Object.values(map).flat());
  const unknownFile = changed.find((file) => !TEST_FILE.test(file) && !ranFiles.has(file));
  if (unknownFile) return { runAll: `${unknownFile} changed and no test ran it` };

  const tests = [...new Set([...Object.keys(map), ...changed.filter((file) => TEST_FILE.test(file))])].filter((file) => file in current);
  const files = tests.filter(
    (file) => changed.includes(file) || failed.includes(file) || map[file]?.some((ran) => changed.includes(ran)),
  );
  return { files, replayed: tests.length - files.length };
}
