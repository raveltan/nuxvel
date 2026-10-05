import type { Rule } from "eslint";

function eventNameFromSource(source: unknown) {
  if (typeof source !== "string") return undefined;

  return /(?:^|\/)events\/(.+?)(?:\.ts)?$/.exec(source)?.[1]?.replaceAll("/", ".");
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
    const emits: { node: Rule.Node; identifier?: string; name?: unknown }[] = [];
    let listened: string | undefined;

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) imports.set(specifier.local.name, node.source.value);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;

        const [first] = node.arguments;

        if (node.callee.name === "defineListener" && first?.type === "ObjectExpression") {
          for (const property of first.properties) {
            if (property.type !== "Property" || property.key.type !== "Identifier") continue;
            if (property.key.name === "event" && property.value.type === "Identifier") listened = property.value.name;
          }
        }

        if (node.callee.name !== "emit") return;
        if (first?.type === "Identifier") emits.push({ node, identifier: first.name });
        if (first?.type === "Literal") emits.push({ node, name: first.value });
      },
      "Program:exit"() {
        if (!listened) return;

        const name = eventNameFromSource(imports.get(listened));

        for (const emitted of emits) {
          if (emitted.identifier === listened || (name !== undefined && emitted.name === name)) {
            context.report({ node: emitted.node, messageId: "loop" });
          }
        }
      },
    };
  },
};
