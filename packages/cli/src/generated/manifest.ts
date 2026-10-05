import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fail } from "../ui/fail.ts";
import { errorMessage } from "../error-message.ts";
import { isRecord } from "../is-record.ts";

interface GeneratedEntry {
  template: string;
  templateVersion: string;
  hash: string;
}

type GeneratedManifest = Record<string, GeneratedEntry>;

export function hash(contents: string) {
  return createHash("sha256").update(contents).digest("hex").slice(0, 16);
}

function manifestPath(cwd: string) {
  return join(cwd, ".nuxvel", "generated.json");
}

function isGeneratedEntry(value: unknown): value is GeneratedEntry {
  return (
    isRecord(value) &&
    typeof value.template === "string" &&
    typeof value.templateVersion === "string" &&
    typeof value.hash === "string"
  );
}

function parseManifest(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${path} is not valid JSON: ${errorMessage(error)}`, {
      hint: "Fix the file, or delete it to stop tracking the generated files",
    });
  }
}

export function readManifest(cwd: string): GeneratedManifest {
  const path = manifestPath(cwd);

  if (!existsSync(path)) return {};

  const parsed = parseManifest(path);
  const malformed = `${path} is malformed`;
  const hint = "It must map each generated file to its template, templateVersion and hash";

  if (!isRecord(parsed)) fail(malformed, { hint });

  const manifest: GeneratedManifest = {};

  for (const [file, entry] of Object.entries(parsed)) {
    if (!isGeneratedEntry(entry)) fail(`${malformed}: the entry for ${file} is not`, { hint });

    manifest[file] = entry;
  }

  return manifest;
}

export function writeManifest(cwd: string, manifest: GeneratedManifest) {
  const path = manifestPath(cwd);
  mkdirSync(dirname(path), { recursive: true });

  const sorted = Object.fromEntries(
    Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)),
  );

  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

export function manifestKey(cwd: string, file: string) {
  return relative(cwd, file).split(sep).join("/");
}
