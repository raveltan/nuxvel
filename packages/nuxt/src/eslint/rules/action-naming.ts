import { basename } from "node:path";
import type { Rule } from "eslint";

function camelCase(name: string) {
  const [first = "", ...rest] = name.split(/[-_\s]+/).filter(Boolean);

  return [first.toLowerCase(), ...rest.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())].join(
    "",
  );
}

export const actionNaming: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "One action per file, exported under the file name's camelCase name, with `Action` at the end for a `.action.ts` file.",
    },
    messages: { naming: "one action per file, exported under the filename's camelCase name" },
    schema: [],
  },
  create(context) {
    const names: string[] = [];

    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type !== "VariableDeclaration") return;

        for (const declarator of node.declaration.declarations) {
          const { id, init } = declarator;

          if (id.type !== "Identifier" || init?.type !== "CallExpression") continue;
          if (init.callee.type === "Identifier" && init.callee.name === "defineAction") names.push(id.name);
        }
      },
      "Program:exit"(node) {
        if (names.length === 0) return;
        if (names.length === 1 && names[0] === camelCase(basename(context.filename, ".ts").replace(/\.action$/, "-action"))) return;

        context.report({ node, messageId: "naming" });
      },
    };
  },
};
