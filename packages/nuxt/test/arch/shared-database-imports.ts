import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { listFiles } from "./list-files";

const PLAYGROUND_SHARED_DIR = fileURLToPath(
  new URL("../../../../playground/shared", import.meta.url),
);

const IMPORT_SOURCE_PATTERN =
  /(?:import|export)[^'"]*from\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;

function importSources(content: string): string[] {
  return [...content.matchAll(IMPORT_SOURCE_PATTERN)].map(
    (match) => match[1] ?? match[2],
  );
}

const FORBIDDEN_SOURCES = new Set(["drizzle-orm", "#nuxvel/schema", "@nuxvel/nuxt/database"]);

function isForbiddenImport(source: string): boolean {
  return (
    FORBIDDEN_SOURCES.has(source) ||
    source.startsWith("drizzle-orm/") ||
    source.includes("server/database")
  );
}

export function findForbiddenSharedImports(
  dir: string = PLAYGROUND_SHARED_DIR,
): string[] {
  return listFiles(dir)
    .filter((path) => path.endsWith(".ts"))
    .filter((path) =>
      importSources(readFileSync(path, "utf8")).some(isForbiddenImport),
    );
}
