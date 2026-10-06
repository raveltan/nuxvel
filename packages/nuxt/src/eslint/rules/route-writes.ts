import type { Rule } from "eslint";

const WRITES = new Set(["insert", "update", "delete"]);
const ONE_ROW_WRITES = new Set(["insertOne", "updateOne"]);

export const routeWrites: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Nitro routes read only: writes go through a tRPC mutation that calls an action." },
    messages: {
      write: "routes may not call useDb().insert/update/delete, insertOne() or updateOne(), write through a tRPC mutation that calls an action",
      action: "routes may not call an action, write through a tRPC mutation that calls it",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === "string" && /(?:^|\/)actions\//.test(node.source.value)) {
          context.report({ node, messageId: "action" });
        }
      },
      CallExpression(node) {
        const { callee } = node;

        if (callee.type === "Identifier" && ONE_ROW_WRITES.has(callee.name)) {
          context.report({ node, messageId: "write" });
          return;
        }

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
