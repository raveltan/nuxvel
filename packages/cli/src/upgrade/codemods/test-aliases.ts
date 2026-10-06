import { isRecord } from "../../is-record.ts";
import { fail } from "../../ui/fail.ts";
import type { Codemod, ManualStep } from "../codemod.ts";

const aliases = {
  "#nuxvel/schema": "./.nuxt/nuxvel/schema.ts",
  "#nuxvel/factories": "./.nuxt/nuxvel/factories.ts",
  "#server/*": "./server/*",
  "#shared/*": "./shared/*",
};

function parseManifest(source: string, file: string) {
  try {
    const manifest: unknown = JSON.parse(source);
    if (isRecord(manifest)) return manifest;
  } catch {}

  return fail(`${file} is not a valid package.json`, { hint: "Fix the file, then run nuxvel upgrade again" });
}

function lineOf(source: string, key: string) {
  return source.split("\n").findIndex((line) => line.includes(JSON.stringify(key))) + 1;
}

function indentOf(source: string) {
  return /^([ \t]+)"/m.exec(source)?.[1] ?? "  ";
}

export const testAliases: Codemod = {
  name: "test-aliases",
  version: "0.3.0",
  description: "Maps #nuxvel/schema, #nuxvel/factories, #server/* and #shared/* in the imports of package.json",
  files: ["package.json"],
  rewrite(source, file) {
    const manifest = parseManifest(source, file);
    const imports = isRecord(manifest.imports) ? manifest.imports : {};
    const manual: ManualStep[] = [];
    const missing = Object.entries(aliases).filter(([key, target]) => {
      if (!(key in imports)) return true;
      if (imports[key] !== target) {
        manual.push({
          line: lineOf(source, key),
          message: `${key} maps to ${JSON.stringify(imports[key])}: map it to "${target}" so tests can import it`,
        });
      }
      return false;
    });

    if (missing.length === 0) return { output: source, manual };

    const upgraded = { ...manifest, imports: { ...imports, ...Object.fromEntries(missing) } };

    return { output: `${JSON.stringify(upgraded, null, indentOf(source))}\n`, manual };
  },
};
