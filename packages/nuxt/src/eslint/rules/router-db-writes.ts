import type { Rule } from "eslint";

const WRITES = new Set(["insert", "update", "delete"]);

export const routerDbWrites: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Routers write through actions, never through useDb() directly." },
    messages: { write: "routers may not call useDb().insert/update/delete, call an action" },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;

        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;
        if (!WRITES.has(callee.property.name)) return;

        const target = callee.object;

        if (target.type === "CallExpression" && target.callee.type === "Identifier" && target.callee.name === "useDb") {
          context.report({ node, messageId: "write" });
        }
      },
    };
  },
};
