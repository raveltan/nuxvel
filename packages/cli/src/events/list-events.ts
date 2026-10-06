import { join, sep } from "node:path";
import { camelCase, definitionName } from "@nuxvel/nuxt/cli";
import type { AppLayout } from "../app-layout/load-app-layout.ts";
import { type TSESTree, eachNode, importedNames, isCallTo, parseFile, propertyValue } from "../source/parse-source.ts";

interface EventListing {
  name: string;
  source: string;
  emitters: string[];
  listeners: { name: string; sync: boolean }[];
}

function definedEventBindings(program: TSESTree.Program) {
  const bindings: string[] = [];

  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue;

    for (const { id, init } of statement.declaration.declarations) {
      if (id.type === "Identifier" && init && isCallTo(init, "defineEvent")) bindings.push(id.name);
    }
  }

  return bindings;
}

export function nameIn(layout: AppLayout, folder: string, file: string) {
  const serverDir = layout.serverDirs.find((dir) => file.startsWith(`${dir}${sep}`)) ?? layout.serverDir;

  return definitionName(join(serverDir, folder), file);
}

export const EVENT_FOLDERS = ["events", "listeners", ""];

function eventsByBinding(layout: AppLayout) {
  const byBinding = new Map<string, string>();
  const sources = new Map<string, string>();

  for (const file of layout.files.events ?? []) {
    const name = nameIn(layout, "events", file);

    for (const binding of definedEventBindings(parseFile(file))) {
      byBinding.set(binding, name);
      sources.set(name, file);
    }

    byBinding.set(["$events", ...name.split(".").map(camelCase)].join("."), name);
  }

  return { byBinding, sources };
}

function memberPath(node: TSESTree.Node): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;

  const object = memberPath(node.object);

  return object && `${object}.${node.property.name}`;
}

function referencedBinding(program: TSESTree.Program, node: TSESTree.Node | undefined) {
  if (node?.type === "MemberExpression") return memberPath(node);
  if (node?.type !== "Identifier") return undefined;

  return importedNames(program).get(node.name)?.imported ?? node.name;
}

function isMethodCall(node: TSESTree.Node, method: string): node is TSESTree.CallExpression & { callee: TSESTree.MemberExpression } {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === method
  );
}

function emittedEvents(program: TSESTree.Program, byBinding: Map<string, string>) {
  const names = new Set<string>();

  eachNode(program, (node) => {
    if (!isMethodCall(node, "emit")) return;

    const name = byBinding.get(referencedBinding(program, node.callee.object) ?? "");

    if (name) names.add(name);
  });

  return names;
}

function listenerDefinition(program: TSESTree.Program) {
  let found: { binding: string | undefined; sync: boolean } | undefined;

  eachNode(program, (node) => {
    const [config] = isCallTo(node, "defineListener") ? node.arguments : [];

    if (found || config?.type !== "ObjectExpression") return;

    const sync = propertyValue(config, "sync");

    found = {
      binding: referencedBinding(program, propertyValue(config, "event")),
      sync: sync?.type === "Literal" && sync.value === true,
    };
  });

  return found;
}

export function listEvents(layout: AppLayout): EventListing[] {
  const { byBinding, sources } = eventsByBinding(layout);
  const listings = new Map<string, EventListing>(
    [...sources].map(([name, source]) => [name, { name, source, emitters: [], listeners: [] }]),
  );

  for (const file of (layout.files[""] ?? []).filter((path) => !path.endsWith(".test.ts"))) {
    for (const name of emittedEvents(parseFile(file), byBinding)) {
      const listing = listings.get(name);
      if (listing && !listing.emitters.includes(file)) listing.emitters.push(file);
    }
  }

  for (const file of layout.files.listeners ?? []) {
    const listener = listenerDefinition(parseFile(file));
    const listing = listings.get(byBinding.get(listener?.binding ?? "") ?? "");

    if (!listener || !listing) continue;

    listing.listeners.push({ name: nameIn(layout, "listeners", file), sync: listener.sync });
  }

  return [...listings.values()].sort((a, b) => a.name.localeCompare(b.name));
}
