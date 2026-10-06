import { readFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "tinyglobby";
import type { Codemod } from "./codemod.ts";

const ignore = ["**/node_modules/**", ".nuxt/**", ".output/**", ".nuxvel/**"];

export async function runCodemods(cwd: string, selected: Codemod[]) {
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  const manual: string[] = [];

  for (const codemod of selected) {
    const files = (await glob(codemod.files, { cwd, ignore, dot: true })).sort();

    for (const file of files) {
      const source = after.get(file) ?? readFileSync(join(cwd, file), "utf8");
      const rewrite = codemod.rewrite(source, file);

      if (!before.has(file)) before.set(file, source);
      after.set(file, rewrite.output);
      manual.push(...rewrite.manual.map((step) => `${file}:${step.line}: ${step.message}`));
    }
  }

  const changed = [...before].flatMap(([path, original]) => {
    const rewritten = after.get(path) ?? original;
    return rewritten === original ? [] : [{ path, before: original, after: rewritten }];
  });

  return { changed, manual };
}
