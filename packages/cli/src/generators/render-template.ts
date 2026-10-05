import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "../generated/manifest.ts";

const builtInTemplatesDir = fileURLToPath(new URL("./templates/", import.meta.url));
const placeholderPattern = /\{\{\s*(\w+)\s*\}\}/g;

function readRawTemplate(name: string, cwd: string) {
  const overridePath = join(cwd, ".nuxvel", "templates", name);
  const templatePath = existsSync(overridePath) ? overridePath : join(builtInTemplatesDir, name);

  return readFileSync(templatePath, "utf-8");
}

export function templateVersion(name: string, cwd = process.cwd()): string {
  return hash(readRawTemplate(name, cwd));
}

export function renderTemplate(name: string, values: Record<string, string>, cwd = process.cwd()): string {
  const raw = readRawTemplate(name, cwd);

  return raw.replace(placeholderPattern, (match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`renderTemplate: missing value for placeholder "${key}" in "${name}"`);
    return value;
  });
}
