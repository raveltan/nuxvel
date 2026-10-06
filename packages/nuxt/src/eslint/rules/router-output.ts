import type { Rule } from "eslint";

const RESOLVERS = new Set(["query", "mutation", "action"]);

export const routerOutput: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Every query, mutation and .action() declares an .output() schema, and every action with a procedure an output, so the browser gets only the fields it lists.",
    },
    messages: {
      missing: "{{name}} has no .output() schema: list the fields that are safe to send to the browser",
      missingActionOutput: "{{name}} has a procedure but no output schema: list the fields that are safe to send to the browser",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        const [config] = node.arguments;

        if (callee.type === "Identifier" && callee.name === "defineAction" && config?.type === "ObjectExpression") {
          const keys = config.properties.flatMap((property) => {
            if (property.type !== "Property") return [];
            if (property.key.type === "Identifier") return [property.key.name];
            return property.key.type === "Literal" ? [String(property.key.value)] : [];
          });
          const spread = config.properties.some((property) => property.type === "SpreadElement");
          const parent = node.parent;
          const name = parent.type === "VariableDeclarator" && parent.id.type === "Identifier" ? parent.id.name : "The action";

          if (keys.includes("procedure") && !keys.includes("output") && !spread) {
            context.report({ node, messageId: "missingActionOutput", data: { name } });
          }
          return;
        }

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
