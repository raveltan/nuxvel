import { dirname, relative, resolve, sep } from "node:path";
import type { Rule } from "eslint";

const MODULE_PATH = /^layers\/([^/]+)(?:\/([^/]+))?/;

function moduleOf(cwd: string, file: string) {
  return MODULE_PATH.exec(relative(cwd, file).split(sep).join("/"));
}

function importedPath(cwd: string, filename: string, source: string) {
  if (source.startsWith("#layers/")) return source.slice(1);
  if (source.startsWith("~~/") || source.startsWith("@@/")) return source.slice(3);
  if (source.startsWith(".")) return relative(cwd, resolve(dirname(filename), source));

  return undefined;
}

export const moduleImports: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A module in layers/ imports another module only from its shared/ folder." },
    messages: {
      crossModule: "layers/{{from}}/ may import from layers/{{to}}/ only under layers/{{to}}/shared/",
    },
    schema: [],
  },
  create(context) {
    const from = moduleOf(context.cwd, context.filename)?.[1];

    if (!from) return {};

    const check = (node: Rule.Node, source: unknown) => {
      if (typeof source !== "string") return;

      const path = importedPath(context.cwd, context.filename, source);
      const target = path === undefined ? undefined : moduleOf(context.cwd, resolve(context.cwd, path));

      if (!target?.[1] || target[1] === from || target[2] === "shared") return;

      context.report({ node, messageId: "crossModule", data: { from, to: target[1] } });
    };

    return {
      ImportDeclaration(node) {
        check(node, node.source.value);
      },
      ExportNamedDeclaration(node) {
        check(node, node.source?.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal") check(node, node.source.value);
      },
    };
  },
};
