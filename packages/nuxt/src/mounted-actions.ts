import { readFileSync } from "node:fs";
import { type Node, type ObjectExpression, type ObjectProperty, parseSync } from "oxc-parser";
import { camelCase } from "./definition-namespaces";
import type { NamedFile } from "./named-files";

/** The keys of a router object literal, each with its own keys when its value is one too. */
export type KeyTree = Map<string, KeyTree | undefined>;

/** An action whose `defineAction()` sets `procedure`: its export and its tRPC path. */
export interface MountedAction {
  file: string;
  exportName: string;
  segments: string[];
}

export function keyName({ key }: ObjectProperty) {
  if (key.type === "Identifier") return key.name;

  return key.type === "Literal" ? String(key.value) : undefined;
}

export function properties(object: ObjectExpression) {
  return object.properties.filter((property): property is ObjectProperty => property.type === "Property" && !property.computed);
}

export function exportedValues(file: string): [string, Node][] {
  const { program } = parseSync(file, readFileSync(file, "utf8"));

  return program.body.flatMap((statement): [string, Node][] => {
    if (statement.type === "ExportDefaultDeclaration") return [["default", statement.declaration]];
    if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") return [];

    return statement.declaration.declarations.flatMap(({ id, init }): [string, Node][] =>
      id.type === "Identifier" && init ? [[id.name, init]] : [],
    );
  });
}

function keyTree(object: ObjectExpression): KeyTree {
  return new Map(
    properties(object).flatMap((property): [string, KeyTree | undefined][] => {
      const name = keyName(property);
      return name === undefined ? [] : [[name, property.value.type === "ObjectExpression" ? keyTree(property.value) : undefined]];
    }),
  );
}

export function routerObject(file: string): ObjectExpression | undefined {
  for (const [name, value] of exportedValues(file)) {
    if ((name === "default" || name.endsWith("Router")) && value.type === "ObjectExpression") return value;
  }

  return undefined;
}

/**
 * The keys of the router object literal `file` exports, by default or
 * under a name ending with `Router`, or `undefined` when it exports no
 * object literal.
 */
export function routerKeys(file: string): KeyTree | undefined {
  const object = routerObject(file);

  return object && keyTree(object);
}

export function actionConfig(value: Node): ObjectExpression | undefined {
  if (value.type !== "CallExpression" || value.callee.type !== "Identifier" || value.callee.name !== "defineAction") return undefined;
  const [config] = value.arguments;

  return config?.type === "ObjectExpression" ? config : undefined;
}

function setsProcedure(value: Node) {
  const config = actionConfig(value);

  return config !== undefined && properties(config).some((property) => keyName(property) === "procedure");
}

/**
 * The discovered actions whose `defineAction()` sets `procedure`, each
 * at its tRPC path: its name with each segment in camelCase
 * (`posts.update-post` is `posts.updatePost`).
 */
export function mountedActions(actions: NamedFile[]): MountedAction[] {
  return actions.flatMap(({ file, name }) => {
    const exported = exportedValues(file).find(([, value]) => setsProcedure(value));

    return exported ? [{ file, exportName: exported[0], segments: name.split(".").map(camelCase) }] : [];
  });
}
