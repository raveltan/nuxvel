import { readFileSync } from "node:fs";
import { parse, simpleTraverse, type TSESTree } from "@typescript-eslint/typescript-estree";

export type { TSESTree };

export function parseSource(source: string): TSESTree.Program {
  return parse(source, { range: true, tokens: true });
}

export function parseFile(file: string): TSESTree.Program {
  return parseSource(readFileSync(file, "utf8"));
}

export function eachNode(program: TSESTree.Program, visit: (node: TSESTree.Node) => void) {
  simpleTraverse(program, { enter: visit });
}

export function isCallTo(node: TSESTree.Node, name: string): node is TSESTree.CallExpression {
  return node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === name;
}

export function propertyValue(object: TSESTree.ObjectExpression, key: string) {
  for (const property of object.properties) {
    if (property.type !== "Property" || property.computed) continue;

    const name = property.key.type === "Identifier" ? property.key.name : property.key.value;

    if (name === key) return property.value;
  }

  return undefined;
}

export function importedNames(program: TSESTree.Program) {
  const imports = new Map<string, { imported: string; source: string }>();

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;

    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") continue;

      const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;

      imports.set(specifier.local.name, { imported, source: statement.source.value });
    }
  }

  return imports;
}
