import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { camelCase } from "@nuxvel/nuxt/cli";

const SOURCE_FILES = "{app,server,shared,layers}/**/*.{ts,tsx,js,mjs,vue}";
const NOT_REFERENCES = ["**/node_modules/**", "server/flags/**", "**/*.test.ts", "**/*.spec.ts"];

function quoted(name: string) {
  return ['"', "'", "`"].map((quote) => `${quote}${name}${quote}`);
}

function namespaced(name: string) {
  const path = ["$flags", ...name.split(".").map(camelCase)].join(".");
  return new RegExp(`${path.replaceAll("$", "\\$").replaceAll(".", "\\.")}(?![\\w$])`);
}

function referenced(name: string, source: string) {
  return quoted(name).some((literal) => source.includes(literal)) || namespaced(name).test(source);
}

export function unreferencedFlags(cwd: string, names: string[]): string[] {
  const sources = globSync(SOURCE_FILES, { cwd, exclude: NOT_REFERENCES }).map((file) =>
    readFileSync(join(cwd, file), "utf8"),
  );

  return names.filter((name) => !sources.some((source) => referenced(name, source)));
}
