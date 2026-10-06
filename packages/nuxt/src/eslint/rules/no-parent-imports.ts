import { dirname, isAbsolute, matchesGlob, relative, resolve, sep } from "node:path";
import type { Rule } from "eslint";

interface Options {
  allow?: string[];
}

interface Place {
  layer?: string;
  root: string;
  kind: string;
  rest: string;
}

type SourceNode = Parameters<NonNullable<Rule.RuleListener["ImportExpression"]>>[0]["source"];
type ImportNode = Parameters<NonNullable<Rule.RuleListener["ImportDeclaration"]>>[0];

const ROOTS = new Set(["server", "app", "shared", "tests"]);
const NESTED_SERVER_FOLDERS = new Set(["database", "trpc"]);
const PARENT = /^(\.\/)?\.\.(\/|$)/;
const SHARED_SCHEMA = /^(layers\/[^/]+\/)?shared\/schemas\/[^/]+$/;
const NOT_AUTO_IMPORTED = /\.(test|spec|stories)\.ts$/;
const ROOT_ALIASES: [prefix: string, folder: string][] = [
  ["#shared/", "shared/"],
  ["~~/", ""],
  ["@@/", ""],
  ["#layers/", "layers/"],
];
const REGISTRIES = [
  { alias: "#nuxvel/schema", folder: "server/database/schema/", domainFile: /^server\/domains\/[^/]+\/schema\/.*\.schema(\.ts)?$/ },
  { alias: "#nuxvel/factories", folder: "server/factories/", domainFile: /^server\/domains\/[^/]+\/factories\/.*\.factory(\.ts)?$/ },
];

function kindDepth(dirs: string[]) {
  if (dirs[0] === "tests") return 1;
  if (dirs[0] === "server" && dirs[1] === "domains") return 4;
  if (dirs[0] === "server" && NESTED_SERVER_FOLDERS.has(dirs[1] ?? "")) return 3;

  return 2;
}

function placeOf(path: string): Place | undefined {
  const segments = path.split("/");
  const layer = segments[0] === "layers" && segments.length > 2 ? segments[1] : undefined;
  const local = layer ? segments.slice(2) : segments;
  const dirs = local.slice(0, -1);
  const root = dirs[0];

  if (!root || !ROOTS.has(root)) return undefined;

  const kind = dirs.slice(0, kindDepth(dirs)).join("/");

  return { layer, root, kind, rest: local.slice(1).join("/") };
}

function label(place: Place) {
  return place.layer ? `layers/${place.layer}/${place.kind}` : place.kind;
}

function registryOf(place: Place) {
  const path = `${place.root}/${place.rest}`;

  return REGISTRIES.find(({ folder, domainFile }) => path.startsWith(folder) || domainFile.test(path))?.alias;
}

function keepsNames(node: ImportNode) {
  return (
    node.specifiers.length > 0 &&
    node.specifiers.every(
      (specifier) => specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier" && specifier.imported.name === specifier.local.name,
    )
  );
}

function pathAlias(from: Place, to: Place) {
  if (from.root === "tests" && (to.layer || to.root === "app" || to.root === "tests")) return undefined;
  if (to.root === "tests") return undefined;
  if (to.layer) return `#layers/${to.layer}/${to.root}/${to.rest}`;
  if (to.root === "app") return `~/${to.rest}`;

  return `#${to.root}/${to.rest}`;
}

/**
 * The `nuxvel/no-parent-imports` rule: code imports another kind folder
 * through an alias, never through `../`. It reports an import that climbs
 * out of its kind folder (`server/actions/`, `server/database/schema/`,
 * `server/domains/<domain>/<kind>/`, `app/components/`, `shared/schemas/`,
 * `tests/`, the same in `layers/<name>/`) into another one, and fixes it:
 * a table to `#nuxvel/schema`, a factory to `#nuxvel/factories` (named
 * imports only, and not from a file of the same registry), other server
 * code to `#server/<path>`, `shared/` to `#shared/<path>`, `app/` to
 * `~/<path>` and a module in `layers/<name>/` to `#layers/<name>/<path>`.
 * It reports server code imported from `app/` or `shared/` without a fix.
 * In `app/` and `server/`, it reports an import of a file in
 * `shared/schemas/` (relative, `#shared/`, `~~/`, `@@/` or
 * `#layers/<name>/`), whose exports are auto-imported there, and removes
 * it when it imports only names under their own name. It skips tests,
 * stories, and the tables and factories that tests and drizzle-kit load
 * without auto-imports.
 * A relative import inside one kind folder stays legal. It is part of the
 * `nuxvel` ESLint plugin.
 *
 * @param options.allow - Globs of import targets, relative to the app
 * root, that a relative import may reach, e.g. `["server/utils/**"]`.
 */
export const noParentImports: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Code imports another kind folder through an alias, never through ../." },
    messages: {
      alias: "{{source}} leaves {{from}}/ for {{to}}/: import it from {{alias}}",
      serverCode: "{{source}} leaves {{from}}/ for {{to}}/: {{root}}/ does not import server code",
      noAlias: "{{source}} leaves {{from}}/ for {{to}}/: no alias reaches it from here",
      autoImported: "{{source}} is in shared/schemas/, whose exports {{root}}/ auto-imports: remove the import",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const [options = {}] = context.options as Options[];
    const allow = options.allow ?? [];
    const relativePath = (path: string) => relative(context.cwd, path).split(sep).join("/");
    const fromPath = relativePath(context.filename);
    const from = placeOf(fromPath);

    if (!from) return {};

    const fromRegistry = registryOf(from);
    const autoImports =
      (from.root === "app" || from.root === "server") && fromRegistry === undefined && !NOT_AUTO_IMPORTED.test(fromPath);

    const targetOf = (source: string) => {
      if (source.startsWith(".")) return relativePath(resolve(dirname(context.filename), source));

      const alias = ROOT_ALIASES.find(([prefix]) => source.startsWith(prefix));

      return alias && `${alias[1]}${source.slice(alias[0].length)}`;
    };

    const checkAutoImported = (node: ImportNode) => {
      const source = node.source.value;

      if (!autoImports || typeof source !== "string" || node.specifiers.length === 0) return false;
      if (!SHARED_SCHEMA.test(targetOf(source) ?? "")) return false;

      const [start, end] = context.sourceCode.getRange(node);
      const lineEnd = context.sourceCode.text[end] === "\n" ? end + 1 : end;

      context.report({
        node,
        messageId: "autoImported",
        data: { source, root: from.root },
        fix: keepsNames(node) ? (fixer) => fixer.removeRange([start, lineEnd]) : null,
      });

      return true;
    };

    const check = (node: Rule.Node, sourceNode: SourceNode | null | undefined, namedOnly: boolean) => {
      if (sourceNode?.type !== "Literal" || typeof sourceNode.value !== "string") return;

      const source = sourceNode.value;

      if (!PARENT.test(source)) return;

      const targetPath = relativePath(resolve(dirname(context.filename), source));

      if (targetPath.startsWith("..") || isAbsolute(targetPath)) return;
      if (allow.some((pattern) => matchesGlob(targetPath, pattern))) return;

      const to = placeOf(targetPath);

      if (!to || (to.layer === from.layer && to.kind === from.kind)) return;

      const data = { source, from: label(from), to: label(to) };
      const clientSide = from.root === "app" || from.root === "shared";

      if (clientSide && to.root === "server") {
        context.report({ node, messageId: "serverCode", data: { ...data, root: from.root } });
        return;
      }

      const registry = registryOf(to);
      const useRegistry = registry !== undefined && registry !== fromRegistry;
      const alias = useRegistry ? registry : pathAlias(from, to);

      if (!alias) {
        context.report({ node, messageId: "noAlias", data });
        return;
      }

      const quote = context.sourceCode.getText(sourceNode).charAt(0);
      const fixable = !useRegistry || namedOnly;

      context.report({
        node,
        messageId: "alias",
        data: { ...data, alias },
        fix: fixable ? (fixer) => fixer.replaceText(sourceNode, `${quote}${alias}${quote}`) : null,
      });
    };

    return {
      ImportDeclaration(node) {
        if (checkAutoImported(node)) return;

        const named = node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.type === "ImportSpecifier");

        check(node, node.source, named);
      },
      ExportNamedDeclaration(node) {
        check(node, node.source, true);
      },
      ExportAllDeclaration(node) {
        check(node, node.source, false);
      },
      ImportExpression(node) {
        check(node, node.source, false);
      },
    };
  },
};
