import type { Rule, Scope } from "eslint";

type CallNode = Extract<Rule.Node, { type: "CallExpression" }>;

type Expression = CallNode["arguments"][number];

type Member = Extract<Expression, { type: "MemberExpression" }>;

type Chain = Expression | Member["object"];

type Unit = "seconds" | "milliseconds";

const JOB_FILE = /(^|\/)jobs\//;

const UNITS: [name: string, seconds: number][] = [
  ["days", 86_400],
  ["hours", 3600],
  ["minutes", 60],
];

const TTL_ARGUMENT: Record<string, number> = { cachePut: 2, remember: 1, withLock: 1 };

function evaluate(node: Expression): number | undefined {
  if (node.type === "Literal") return typeof node.value === "number" ? node.value : undefined;
  if (node.type === "UnaryExpression" && node.operator === "-") {
    const value = evaluate(node.argument);
    return value === undefined ? undefined : -value;
  }
  if (node.type !== "BinaryExpression" || node.left.type === "PrivateIdentifier") return undefined;

  const left = evaluate(node.left);
  const right = evaluate(node.right);
  if (left === undefined || right === undefined) return undefined;
  if (node.operator === "*") return left * right;
  if (node.operator === "+") return left + right;
  if (node.operator === "-") return left - right;

  return node.operator === "/" ? left / right : undefined;
}

function durationText(seconds: number) {
  const [name, size] = UNITS.find(([, unitSeconds]) => seconds % unitSeconds === 0) ?? ["seconds", 1];

  return `{ ${name}: ${seconds / size} }`;
}

function rootIdentifier(node: Chain): Extract<Expression, { type: "Identifier" }> | undefined {
  if (node.type === "Identifier") return node;
  if (node.type !== "MemberExpression" || node.object.type === "Super") return undefined;

  return rootIdentifier(node.object);
}

function property(node: Expression | undefined, name: string): Expression | undefined {
  if (node?.type !== "ObjectExpression") return undefined;

  for (const entry of node.properties) {
    if (entry.type !== "Property" || entry.computed || entry.key.type !== "Identifier" || entry.key.name !== name) continue;
    const { value } = entry;

    return value.type === "ObjectPattern" || value.type === "ArrayPattern" || value.type === "RestElement" || value.type === "AssignmentPattern"
      ? undefined
      : value;
  }

  return undefined;
}

export const durations: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Rewrites a duration given as a number of seconds or milliseconds to a duration object such as { minutes: 5 }." },
    messages: {
      rewritten: "{{option}} takes a duration object",
      manual:
        "{{option}} takes a duration such as { minutes: 5 } in place of a number of {{unit}}: rewrite the value by hand, or leave the option out when it is zero",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    function rewrite(value: Expression | undefined, option: string, unit: Unit) {
      if (!value || value.type === "ObjectExpression" || value.type === "SpreadElement") return;
      const amount = evaluate(value);
      const seconds = amount === undefined ? undefined : unit === "seconds" ? amount : amount / 1000;

      if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
        context.report({ node: value, messageId: "manual", data: { option, unit } });
        return;
      }

      context.report({ node: value, messageId: "rewritten", data: { option }, fix: (fixer) => fixer.replaceText(value, durationText(seconds)) });
    }

    function jobDispatch(callee: Member) {
      const identifier = rootIdentifier(callee.object);
      if (!identifier) return false;
      if (identifier.name === "$jobs") return true;

      for (let scope: Scope.Scope | null = sourceCode.getScope(identifier); scope; scope = scope.upper) {
        const variable = scope.set.get(identifier.name);
        if (!variable) continue;

        return variable.defs.some((definition) => {
          if (definition.type !== "ImportBinding") return false;
          const { value } = definition.parent.source;

          return typeof value === "string" && JOB_FILE.test(value);
        });
      }

      return false;
    }

    return {
      CallExpression(call) {
        const { callee } = call;

        if (callee.type === "Identifier" && callee.name in TTL_ARGUMENT) {
          rewrite(call.arguments[TTL_ARGUMENT[callee.name] ?? 0], `the ttl of ${callee.name}()`, "seconds");
        } else if (callee.type === "Identifier" && callee.name === "signedUrl") {
          rewrite(property(call.arguments[1], "expiresIn"), "expiresIn of signedUrl()", "seconds");
        } else if (callee.type === "Identifier" && callee.name === "defineJob") {
          rewrite(property(call.arguments[0], "timeout"), "timeout of defineJob()", "milliseconds");
          rewrite(property(call.arguments[0], "backoff"), "backoff of defineJob()", "milliseconds");
        } else if (
          callee.type === "MemberExpression" &&
          !callee.computed &&
          callee.property.type === "Identifier" &&
          callee.property.name === "dispatch" &&
          jobDispatch(callee)
        ) {
          rewrite(property(call.arguments[1], "delay"), "delay of dispatch()", "milliseconds");
        }
      },
    };
  },
};
