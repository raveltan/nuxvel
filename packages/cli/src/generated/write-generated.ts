import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fail } from "../ui/fail.ts";
import { renderTemplate, templateVersion } from "../generators/render-template.ts";
import { hash, manifestKey, readManifest, writeManifest } from "./manifest.ts";

export interface GeneratedFile {
  path: string;
  template: string;
  values: Record<string, string>;
}

function existingPath(path: string) {
  const dir = dirname(path);

  if (!existsSync(dir)) return undefined;

  const name = basename(path).toLowerCase();
  const match = readdirSync(dir).find((entry) => entry.toLowerCase() === name);

  return match === undefined ? undefined : join(dir, match);
}

export function writeGeneratedFiles(cwd: string, files: GeneratedFile[], options: { force: boolean }) {
  const existing = files.map((file) => existingPath(file.path)).filter((path) => path !== undefined);

  if (existing.length > 0 && !options.force) {
    const list = existing.map((path) => relative(cwd, path)).join(", ");
    fail(`Refusing to overwrite ${list}`, { hint: "Pass --force to overwrite" });
  }

  const manifest = readManifest(cwd);

  for (const { path, template, values } of files) {
    const contents = renderTemplate(template, values, cwd);

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);

    manifest[manifestKey(cwd, path)] = {
      template,
      templateVersion: templateVersion(template, cwd),
      hash: hash(contents),
    };
  }

  writeManifest(cwd, manifest);

  return files.map((file) => file.path);
}
