import type { AST, Rule } from "eslint";
import type { DefinitionImport } from "./explicit-imports.ts";

/**
 * The fix that adds the import of each definition of `definitions` after
 * the last import of the file, or at its top when it has none.
 */
export function addDefinitionImports(fixer: Rule.RuleFixer, program: AST.Program, definitions: readonly DefinitionImport[]): Rule.Fix {
  const byPath: Record<string, { values: Set<string>; defaults: Set<string> }> = {};

  for (const { path, name, isDefault } of definitions) {
    const bucket = (byPath[path] ??= { values: new Set<string>(), defaults: new Set<string>() });
    (isDefault ? bucket.defaults : bucket.values).add(name);
  }

  const lines = Object.entries(byPath)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .flatMap(([path, names]) => [
      ...(names.values.size > 0 ? [`import { ${[...names.values].sort().join(", ")} } from ${JSON.stringify(path)};`] : []),
      ...(names.defaults.size > 0 ? [...names.defaults].sort().map((name) => `import ${name} from ${JSON.stringify(path)};`) : []),
    ]);
  const text = lines.join("\n");
  const imports = program.body.filter((statement) => statement.type === "ImportDeclaration");
  const lastImport = imports[imports.length - 1];
  const [start] = program.range;

  return lastImport ? fixer.insertTextAfter(lastImport, `\n${text}`) : fixer.insertTextBeforeRange([start, start], `${text}\n\n`);
}
