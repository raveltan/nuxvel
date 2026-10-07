import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { simpleTraverse } from "@typescript-eslint/typescript-estree";
import { importedNames, isCallTo, parseSource, propertyValue, type TSESTree } from "../../source/parse-source.ts";

export interface AuditedUse {
  line: number;
  call: string;
  name: string;
  target: string;
  targetSource?: string;
  removal: [number, number];
  mutation?: TSESTree.CallExpression;
  actionFile?: string;
  problem?: string;
}

function kebabCase(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function sourceFile(cwd: string, routerFile: string, source: string) {
  const base = source.startsWith("#server/")
    ? join(cwd, "server", source.slice("#server/".length))
    : source.startsWith(".")
      ? resolve(cwd, dirname(routerFile), source)
      : undefined;
  const file = base && [base, `${base}.ts`].find((candidate) => candidate.endsWith(".ts") && existsSync(candidate));

  return file && relative(cwd, file);
}

function namespacePath(node: TSESTree.Node): string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;
  const parent = namespacePath(node.object);

  return parent && [...parent, node.property.name];
}

function namespacedFile(cwd: string, path: string[]) {
  const folders = path.slice(1, -1).map(kebabCase).join("/");
  const name = kebabCase(path.at(-1) ?? "");

  return [`server/actions/${folders}/${name}.action.ts`, `server/actions/${folders}/${name}.ts`].find((file) => existsSync(join(cwd, file)));
}

function calledActions(cwd: string, routerFile: string, handler: TSESTree.Node, imports: ReturnType<typeof importedNames>) {
  const files = new Set<string>();

  simpleTraverse(handler, { enter: (node) => {
    if (node.type !== "CallExpression") return;
    const path = namespacePath(node.callee);
    if (path?.[0] === "$actions") {
      files.add(namespacedFile(cwd, path) ?? path.slice(1).join("."));
      return;
    }
    const imported = path?.length === 1 && path[0] ? imports.get(path[0]) : undefined;
    const file = imported && sourceFile(cwd, routerFile, imported.source);
    if (file?.startsWith("server/actions/")) files.add(file);
  } });

  return [...files];
}

function chainedMutation(use: TSESTree.CallExpression) {
  let node: TSESTree.Node = use;

  for (;;) {
    const member: TSESTree.Node | undefined = node.parent;
    const call: TSESTree.Node | undefined = member?.parent;
    if (member?.type !== "MemberExpression" || call?.type !== "CallExpression" || member.property.type !== "Identifier") return undefined;
    if (member.property.name === "mutation") return call;
    node = call;
  }
}

/**
 * Each `.use(audited(name, { target }))` of a router file: where it is,
 * what it audits, the `.mutation()` it ends in, and the action file that
 * mutation calls, or why the codemod cannot move it.
 */
export function auditedUses(source: string, file: string, cwd: string): AuditedUse[] {
  if (!source.includes("audited(")) return [];

  const program = parseSource(source);
  const imports = importedNames(program);
  const uses: AuditedUse[] = [];

  simpleTraverse(program, { enter: (node) => {
    if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression" || node.callee.property.type !== "Identifier") return;
    const [audited] = node.arguments;
    if (node.callee.property.name !== "use" || !audited || !isCallTo(audited, "audited")) return;

    const [name, options] = audited.arguments;
    const target = options?.type === "ObjectExpression" ? propertyValue(options, "target") : undefined;
    const mutation = chainedMutation(node);
    const handler = mutation?.arguments[0];
    const use: AuditedUse = {
      line: source.slice(0, audited.range[0]).split("\n").length,
      call: source.slice(...audited.range),
      name: name?.type === "Literal" && typeof name.value === "string" ? name.value : "",
      target: target?.type === "Identifier" ? target.name : "",
      removal: [node.callee.object.range[1], node.range[1]],
    };
    use.targetSource = imports.get(use.target)?.source;

    if (!use.name || !use.target) use.problem = "the name is not a string, or the target is not a table name";
    else if (!mutation || !handler) use.problem = "audited() is not on a .mutation() procedure";
    else {
      const actions = calledActions(cwd, file, handler, imports);
      const [action] = actions;
      if (actions.length > 1) use.problem = `the mutation calls ${actions.length} actions`;
      else if (action && !action.startsWith("server/actions/")) use.problem = `no file of server/actions/ is ${action}`;
      else if (action && !use.targetSource) use.problem = `${use.target} is not imported`;
      else if (action) use.actionFile = action;
      else if (handler.type !== "ArrowFunctionExpression" && handler.type !== "FunctionExpression") use.problem = "the mutation handler is not a function";
      else use.mutation = mutation;
    }

    uses.push(use);
  } }, true);

  return uses;
}

/** The import source of `source` as `toFile` imports it: an alias stays, a relative path is made relative to `toFile`. */
export function importFrom(source: string, fromFile: string, toFile: string) {
  if (!source.startsWith(".")) return source;
  const path = relative(dirname(toFile), resolve(dirname(fromFile), source));

  return path.startsWith(".") ? path : `./${path}`;
}
