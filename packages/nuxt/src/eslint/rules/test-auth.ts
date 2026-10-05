import type { Rule } from "eslint";
import type { CallNode } from "./ast";

const TEST_FUNCTIONS = new Set(["it", "test"]);
const SIGN_UP_OR_IN = /^\/api\/auth\/sign-(up|in)\/email(?:[/?#]|$)/;

function rootName(node: CallNode["callee"]): string | undefined {
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return rootName(node.object);
  if (node.type === "CallExpression") return rootName(node.callee);

  return undefined;
}

function isTestBody(node: Rule.Node) {
  if (node.type !== "ArrowFunctionExpression" && node.type !== "FunctionExpression") return false;

  const { parent } = node;

  if (parent.type !== "CallExpression" || !parent.arguments.includes(node)) return false;

  const name = rootName(parent.callee);

  return name !== undefined && TEST_FUNCTIONS.has(name);
}

function inTestBody(node: Rule.Node) {
  for (let current: Rule.Node | null = node.parent; current; current = current.parent) {
    if (isTestBody(current)) return true;
  }

  return false;
}

/**
 * The `nuxvel/test-auth` rule: a test gets its user from a factory, not
 * from a sign-up over HTTP. It reports the path `/api/auth/sign-up/email`
 * or `/api/auth/sign-in/email` outside the body of an `it` or `test`: in
 * a helper function, a hook or at the top of the file. A test of the
 * sign-up or the sign-in itself sends the request in its own body. It is
 * part of the `nuxvel` ESLint plugin.
 */
export const testAuth: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: { description: "A test gets its user from a factory, with actingAs() or signIn(), not from a sign-up over HTTP." },
    messages: {
      signUp:
        "{{path}} outside a test: create the user with a factory and reach the app with actingAs(user), or with signIn(email, password) to test a real session",
    },
    schema: [],
  },
  create(context) {
    function check(node: Rule.Node, value: string | undefined | null) {
      const path = value?.match(SIGN_UP_OR_IN)?.[0];

      if (path && !inTestBody(node)) context.report({ node, messageId: "signUp", data: { path: path.replace(/[/?#]$/, "") } });
    }

    return {
      Literal(node) {
        if (typeof node.value === "string") check(node, node.value);
      },
      TemplateLiteral(node) {
        for (const quasi of node.quasis) check(node, quasi.value.cooked);
      },
    };
  },
};
