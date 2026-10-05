import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const VUE_COMPILER_OUTPUT = /\.vue\.d\.ts$/;
const VUE_UNWRAPPED_REF = /import\("vue"\)\.Ref<any, any>/g;

function anyCount(source: string) {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) count++;
    ts.forEachChild(node, visit);
  };

  visit(ts.createSourceFile("file.ts", source, ts.ScriptTarget.Latest, true));

  return count;
}

function sourceOf(sourceDir: string, declaration: string) {
  const base = join(sourceDir, declaration.replace(/\.d\.ts$/, ""));
  return [`${base}.ts`, base].find(existsSync);
}

export function findDegradedDeclarations(declarationDir: string, sourceDir: string): string[] {
  return readdirSync(declarationDir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".d.ts") && !VUE_COMPILER_OUTPUT.test(file))
    .flatMap((file) => {
      const source = sourceOf(sourceDir, file);
      const declared = anyCount(readFileSync(join(declarationDir, file), "utf8").replace(VUE_UNWRAPPED_REF, ""));
      const written = source ? anyCount(readFileSync(source, "utf8")) : 0;

      return declared > written ? [`${file}: ${declared - written} any not in its source`] : [];
    });
}
