import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Node, type ObjectExpression, parseSync } from "oxc-parser";
import { camelCase } from "./definition-namespaces";
import { actionConfig, exportedValues, keyName, mountedActions, properties, routerObject } from "./mounted-actions";
import type { LayerFiles, NamedFile } from "./named-files";
import { trpcRouterFiles } from "./trpc-namespaces";

/** A schema that a file of `shared/schemas/` exports: its export name and its file. */
export interface SharedSchema {
  name: string;
  file: string;
}

type Binding = { source: string; imported: string } | undefined;

function exportNames(schemaFiles: string[]) {
  return new Map(schemaFiles.map((file) => [file, exportedValues(file).flatMap(([name]) => (name === "default" ? [] : [name]))]));
}

function autoImported(exports: Map<string, string[]>) {
  const schemas = new Map<string, string | undefined>();

  for (const [file, names] of exports) {
    for (const name of names) schemas.set(name, schemas.has(name) ? undefined : file);
  }

  return schemas;
}

function patternNames(node: Node | null | undefined): string[] {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "ObjectPattern") return node.properties.flatMap((property) => patternNames(property.type === "RestElement" ? property.argument : property.value));
  if (node.type === "ArrayPattern") return node.elements.flatMap((element) => patternNames(element));
  if (node.type === "RestElement") return patternNames(node.argument);
  if (node.type === "AssignmentPattern") return patternNames(node.left);

  return [];
}

function declaredNames(node: Node | null | undefined): string[] {
  if (node?.type === "VariableDeclaration") return node.declarations.flatMap(({ id }) => patternNames(id));
  if ((node?.type === "FunctionDeclaration" || node?.type === "ClassDeclaration" || node?.type === "TSEnumDeclaration") && node.id) return [node.id.name];

  return [];
}

function fileBindings(file: string) {
  const { program } = parseSync(file, readFileSync(file, "utf8"));
  const bindings = new Map<string, Binding>();

  for (const statement of program.body) {
    if (statement.type === "ImportDeclaration") {
      for (const specifier of statement.specifiers) {
        const imported = specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier" ? specifier.imported.name : undefined;
        bindings.set(specifier.local.name, imported ? { source: statement.source.value, imported } : undefined);
      }
      continue;
    }
    const declaration = statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration" ? statement.declaration : statement;
    for (const name of declaredNames(declaration)) bindings.set(name, undefined);
  }

  return bindings;
}

function importedFile(source: string, from: string, schemaFiles: string[]) {
  const alias = /^(#shared\/|~~\/shared\/|@@\/shared\/)/.exec(source);
  const candidates = (path: string) => [path, `${path}.ts`, `${path}/index.ts`];

  if (source.startsWith(".")) {
    const paths = candidates(resolve(dirname(from), source));
    return schemaFiles.find((file) => paths.includes(file));
  }
  if (!alias) return undefined;
  const tails = candidates(`/shared/${source.slice(alias[0].length)}`);

  return schemaFiles.find((file) => tails.some((tail) => file.endsWith(tail)));
}

function memberPath(node: Node): string[] | undefined {
  if (node.type === "Identifier") return [node.name];
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;
  const object = memberPath(node.object);

  return object && [...object, node.property.name];
}

function chainedCalls(node: Node) {
  const calls: { method: string; argument: Node | undefined }[] = [];
  let call = node;

  while (call.type === "CallExpression" && call.callee.type === "MemberExpression" && !call.callee.computed && call.callee.property.type === "Identifier") {
    calls.push({ method: call.callee.property.name, argument: call.arguments[0] });
    call = call.callee.object;
  }

  return calls;
}

/**
 * Maps each mutation of the app router to the schema of `shared/schemas/`
 * its input is, by reading the source: a router procedure with one
 * `.input(schema)` and `.mutation()`, a router procedure with
 * `.action(action)`, and an action with `procedure`, each with an
 * `input` that names a shared schema. A name the file imports resolves
 * through its import (`#shared/`, `~~/shared/`, `@@/shared/` or a relative
 * path), renamed or not. A name the file does not bind is an auto-import,
 * unless two files of `shared/schemas/` export it. A name the file
 * declares itself, and a mutation whose input is written in place or
 * comes from elsewhere, has no entry.
 *
 * @internal Shared by the module's codegen and `@nuxvel/cli`.
 */
export function procedureInputs(routerLayers: LayerFiles[], actions: NamedFile[], schemaFiles: string[]) {
  const exports = exportNames(schemaFiles);
  const schemas = autoImported(exports);
  const inputs = new Map<string, SharedSchema>();
  const bindings = new Map<string, Map<string, Binding>>();

  const sharedSchema = (node: Node | undefined, file: string): SharedSchema | undefined => {
    if (node?.type !== "Identifier") return undefined;
    const own = bindings.get(file) ?? fileBindings(file);
    bindings.set(file, own);

    if (!own.has(node.name)) {
      const schemaFile = schemas.get(node.name);
      return schemaFile ? { name: node.name, file: schemaFile } : undefined;
    }
    const binding = own.get(node.name);
    const schemaFile = binding && importedFile(binding.source, file, schemaFiles);

    return binding && schemaFile && exports.get(schemaFile)?.includes(binding.imported) ? { name: binding.imported, file: schemaFile } : undefined;
  };

  const actionInput = (action: NamedFile | undefined) => {
    const config = action && exportedValues(action.file).map(([, value]) => actionConfig(value)).find(Boolean);
    const input = config && properties(config).find((property) => keyName(property) === "input");

    return action && sharedSchema(input?.value, action.file);
  };

  const referencedAction = (node: Node | undefined) => {
    const path = node && memberPath(node);
    if (path?.[0] === "$actions") {
      const name = path.slice(1).join(".");
      return actions.find((action) => action.name.split(".").map(camelCase).join(".") === name);
    }
    const [exported] = path?.length === 1 ? path : [];

    return actions.find(({ file }) => exportedValues(file).some(([name]) => name === exported));
  };

  const procedureInput = (value: Node, file: string) => {
    const [last, ...rest] = chainedCalls(value);
    if (last?.method === "action") return actionInput(referencedAction(last.argument));
    const input = rest.filter(({ method }) => method === "input");

    return last?.method === "mutation" && input.length === 1 ? sharedSchema(input[0]?.argument, file) : undefined;
  };

  const walk = (object: ObjectExpression, segments: string[], file: string) => {
    for (const property of properties(object)) {
      const key = keyName(property);
      if (key === undefined) continue;
      if (property.value.type === "ObjectExpression") {
        walk(property.value, [...segments, key], file);
        continue;
      }
      const input = procedureInput(property.value, file);
      if (input) inputs.set([...segments, key].join("."), input);
    }
  };

  for (const { file, segments } of trpcRouterFiles(routerLayers)) {
    const object = routerObject(file);
    if (object) walk(object, segments, file);
  }

  for (const { file, segments } of mountedActions(actions)) {
    const input = actionInput(actions.find((action) => action.file === file));
    if (input) inputs.set(segments.join("."), input);
  }

  return inputs;
}

/**
 * Builds `#nuxvel/procedure-inputs`, which `useActionForm()` reads: an
 * object from each mutation path to its shared input schema, see
 * {@link procedureInputs}. With `declaration`, it is the `.d.ts` of
 * that module.
 */
export function buildProcedureInputsModuleCode(inputs: Map<string, SharedSchema>, declaration: boolean) {
  const schemas = [...new Map([...inputs.values()].map((schema) => [`${schema.file}#${schema.name}`, schema])).values()];
  const imports = schemas.map(
    ({ name, file }, index) =>
      `import ${declaration ? "type " : ""}{ ${name} as schema${index} } from ${JSON.stringify(declaration ? file.replace(/\.ts$/, "") : file)};`,
  );
  const body = [...inputs]
    .map(([path, { name, file }]) => {
      const index = schemas.findIndex((schema) => schema.name === name && schema.file === file);
      return `${JSON.stringify(path)}: ${declaration ? "typeof " : ""}schema${index}`;
    })
    .join(", ");

  return declaration
    ? `${imports.join("\n")}\n\ndeclare const procedureInputs: { ${body} };\nexport default procedureInputs;\n`
    : `${imports.join("\n")}\n\nexport default { ${body} };\n`;
}
