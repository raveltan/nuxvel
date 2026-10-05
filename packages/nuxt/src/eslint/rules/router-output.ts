import type { Rule } from "eslint";

const RESOLVERS = new Set(["query", "mutation"]);

export const routerOutput: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Every query and mutation declares an .output() schema, so the browser gets only the fields it lists." },
    messages: { missing: "{{name}} has no .output() schema: list the fields that are safe to send to the browser" },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;

        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
        if (!RESOLVERS.has(callee.property.name)) return;

        let link = callee.object;

        while (link.type === "CallExpression" && link.callee.type === "MemberExpression") {
          if (link.callee.property.type === "Identifier" && link.callee.property.name === "output") return;
          link = link.callee.object;
        }

        if (link.type !== "Identifier" || !link.name.endsWith("Procedure")) return;

        const parent = node.parent;
        const name = parent.type === "Property" && parent.key.type === "Identifier" ? parent.key.name : "A procedure";

        context.report({ node, messageId: "missing", data: { name } });
      },
    };
  },
};
