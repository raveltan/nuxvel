import type { Rule } from "eslint";

type MemberObject = Extract<Rule.Node, { type: "MemberExpression" }>["object"];

function eventNameFromSource(source: unknown) {
  if (typeof source !== "string") return undefined;

  return /(?:^|\/)events\/(.+?)(?:\.ts)?$/.exec(source)?.[1]?.replaceAll("/", ".");
}

function namespacedEvent(node: MemberObject): string | undefined {
  if (node.type !== "MemberExpression" || node.computed || node.property.type !== "Identifier") return undefined;
  if (node.object.type === "Identifier") return node.object.name === "$events" ? kebabCase(node.property.name) : undefined;

  const parent = namespacedEvent(node.object);

  return parent && `${parent}.${kebabCase(node.property.name)}`;
}

function kebabCase(segment: string) {
  return segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export const listenerEmitLoop: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A listener does not emit the event it listens to." },
    messages: { loop: "listeners may not emit the event they listen to, it runs the listener again in a loop" },
    schema: [],
  },
  create(context) {
    const imports = new Map<string, unknown>();
    const emits: { node: Rule.Node; identifier?: string; name?: string }[] = [];
    let listened: string | undefined;
    let listenedName: string | undefined;

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) imports.set(specifier.local.name, node.source.value);
      },
      CallExpression(node) {
        const { callee } = node;

        if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "emit") {
          if (callee.object.type === "Identifier") emits.push({ node, identifier: callee.object.name });
          else emits.push({ node, name: namespacedEvent(callee.object) });
          return;
        }

        const [first] = node.arguments;

        if (callee.type === "Identifier" && callee.name === "defineListener" && first?.type === "ObjectExpression") {
          for (const property of first.properties) {
            if (property.type !== "Property" || property.key.type !== "Identifier") continue;
            if (property.key.name !== "event") continue;
            if (property.value.type === "Identifier") listened = property.value.name;
            if (property.value.type === "MemberExpression") listenedName = namespacedEvent(property.value);
          }
        }

      },
      "Program:exit"() {
        if (!listened && !listenedName) return;

        const name = listenedName ?? (listened && eventNameFromSource(imports.get(listened)));

        for (const emitted of emits) {
          if ((listened !== undefined && emitted.identifier === listened) || (name !== undefined && emitted.name === name)) {
            context.report({ node: emitted.node, messageId: "loop" });
          }
        }
      },
    };
  },
};
