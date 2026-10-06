import { dirname, relative, resolve, sep } from "node:path";
import type { Rule } from "eslint";

const SERVER_PATH = /^(layers\/[^/]+\/)?server(\/|$)/;
const SERVER_MODULES = ["drizzle-orm", "@nuxvel/nuxt/database", "#nuxvel/", "#server/"];

function importedPath(cwd: string, filename: string, source: string) {
  if (source.startsWith("#layers/")) return source.slice(1);
  if (source.startsWith("~~/") || source.startsWith("@@/")) return source.slice(3);
  if (source.startsWith(".")) return relative(cwd, resolve(dirname(filename), source)).split(sep).join("/");

  return undefined;
}

function serverOnly(cwd: string, filename: string, source: string) {
  const path = importedPath(cwd, filename, source);

  return (path !== undefined && SERVER_PATH.test(path)) || SERVER_MODULES.some((module) => source === module || source.startsWith(module.endsWith("/") ? module : `${module}/`));
}

/**
 * The `nuxvel/shared-imports` rule: a file under `shared/` runs in the
 * browser, so it imports no server code. It reports an import of a file
 * under `server/` (relative, `#server/`, `~~/`, `@@/` or
 * `#layers/<name>/server/`), of a generated `#nuxvel/*` module, of
 * `drizzle-orm` or of `@nuxvel/nuxt/database`. The schemas of
 * `shared/schemas/` reach the client bundle of every form, see
 * `useActionForm()`. It is part of the `nuxvel` ESLint plugin.
 */
export const sharedImports: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A file under shared/ runs in the browser and imports no server code." },
    messages: { serverOnly: "{{source}} is server code: shared/ runs in the browser and may not import it" },
    schema: [],
  },
  create(context) {
    const check = (node: Rule.Node, source: unknown) => {
      if (typeof source === "string" && serverOnly(context.cwd, context.filename, source)) {
        context.report({ node, messageId: "serverOnly", data: { source } });
      }
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
