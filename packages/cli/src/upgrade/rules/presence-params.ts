import type { Rule } from "eslint";

type CallNode = Extract<Rule.Node, { type: "CallExpression" }>;

type Argument = CallNode["arguments"][number];

function takesOptions(node: Argument) {
  if (node.type !== "ObjectExpression" || node.properties.length !== 1) return false;
  const [only] = node.properties;

  return only?.type === "Property" && !only.computed && only.key.type === "Identifier" && only.key.name === "params";
}

export const presenceParams: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Wraps the room of usePresence(name, room) in its params option: usePresence(name, { params: room })." },
    messages: {
      wrapped: "usePresence() takes the room as { params }",
      manual:
        "usePresence() takes the room as its params option: write usePresence(name, { params: room }) when this argument is the room",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    return {
      CallExpression(call) {
        const [, room] = call.arguments;
        if (call.callee.type !== "Identifier" || call.callee.name !== "usePresence" || !room || takesOptions(room)) return;

        if (room.type !== "ObjectExpression") {
          context.report({ node: room, messageId: "manual" });
          return;
        }

        context.report({
          node: room,
          messageId: "wrapped",
          fix: (fixer) => fixer.replaceText(room, `{ params: ${sourceCode.getText(room)} }`),
        });
      },
    };
  },
};
