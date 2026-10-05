import type { Rule } from "eslint";

const NETWORK_CALLS = new Set(["fetch", "$fetch", "ofetch", "sendMail", "sendMailNow", "useS3", "useBucket", "promoteUpload", "checkUpload"]);

function isSyncListener(node: Rule.Node) {
  if (node.type !== "CallExpression") return false;

  const [config] = node.arguments;

  if (node.callee.type !== "Identifier" || node.callee.name !== "defineListener") return false;
  if (config?.type !== "ObjectExpression") return false;

  return config.properties.some(
    (property) =>
      property.type === "Property" &&
      property.key.type === "Identifier" &&
      property.key.name === "sync" &&
      property.value.type === "Literal" &&
      property.value.value === true,
  );
}

export const syncListenerNetwork: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A sync listener runs inside the emitting transaction, so it makes no network calls." },
    messages: {
      network:
        "sync listeners may not call {{name}}(), it holds the emitting transaction open: remove sync: true to queue the listener",
    },
    schema: [],
  },
  create(context) {
    const calls: { node: Rule.Node; name: string }[] = [];
    let sync = false;

    return {
      CallExpression(node) {
        if (isSyncListener(node)) sync = true;
        if (node.callee.type === "Identifier" && NETWORK_CALLS.has(node.callee.name)) {
          calls.push({ node, name: node.callee.name });
        }
      },
      "Program:exit"() {
        if (!sync) return;

        for (const { node, name } of calls) context.report({ node, messageId: "network", data: { name } });
      },
    };
  },
};
