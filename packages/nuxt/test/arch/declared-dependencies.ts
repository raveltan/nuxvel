import { readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles } from "./list-files";

const PACKAGE_DIR = fileURLToPath(new URL("../..", import.meta.url));

const SOURCE_PATTERN = /\.(ts|vue|css)$/;
const COMMENT_LINE_PATTERN = /^\s*(\*|\/\/).*$/gm;
const SPECIFIER_PATTERN =
  /(?:import|export)[^'"`;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']|declare module\s+["']([^"']+)["']|@import\s+["']([^"']+)["']/g;

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function packageName(specifier: string) {
  const [scope = "", name = ""] = specifier.split("/");
  return scope.startsWith("@") ? `${scope}/${name}` : scope;
}

function isBare(specifier: string) {
  return !/^[.#/~]/.test(specifier) && !specifier.startsWith("node:") && !builtinModules.includes(specifier);
}

export function findUndeclaredImports(packageDir: string = PACKAGE_DIR): string[] {
  const manifest: Manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const declared = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);

  return listFiles(join(packageDir, "src"))
    .filter((path) => SOURCE_PATTERN.test(path))
    .flatMap((path) =>
      [...readFileSync(path, "utf8").replace(COMMENT_LINE_PATTERN, "").matchAll(SPECIFIER_PATTERN)]
        .map((match) => match.slice(1).find(Boolean) ?? "")
        .filter(isBare)
        .map(packageName)
        .filter((name) => !declared.has(name))
        .map((name) => `${relative(packageDir, path)} ${name}`),
    );
}
