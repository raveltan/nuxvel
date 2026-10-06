import type { Rule, Scope } from "eslint";

type CallNode = Extract<Rule.Node, { type: "CallExpression" }>;

type Argument = CallNode["arguments"][number];

const CHECKS = new Set(["can", "authorize", "canMany"]);
const ACTOR_FACTORIES = new Set(["systemActor", "userActor", "apiKeyActor"]);

function isString(node: Argument) {
  return (node.type === "Literal" && typeof node.value === "string") || node.type === "TemplateLiteral";
}

function looksLikeActor(node: Argument) {
  if (node.type === "Identifier") return /actor$/i.test(node.name);
  if (node.type === "MemberExpression") return !node.computed && node.property.type === "Identifier" && /actor$/i.test(node.property.name);
  if (node.type === "CallExpression") return node.callee.type === "Identifier" && ACTOR_FACTORIES.has(node.callee.name);

  return node.type === "ObjectExpression";
}

function takesActor(args: CallNode["arguments"]) {
  const [first] = args;
  if (!first || first.type === "SpreadElement" || isString(first)) return false;
  if (args.length === 4) return true;

  return args.length === 3 && looksLikeActor(first);
}

export const actorArg: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Removes the actor argument of can(), authorize() and canMany(), which now read the ambient actor." },
    messages: {
      removed: "{{name}}() reads the ambient actor",
      manual:
        "{{name}}() no longer takes an actor: it reads the actor of the running procedure, action, job or seeder. Remove the first argument when it is that actor, or move the check into an action called with { actor }",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (![...CHECKS].some((name) => sourceCode.text.includes(`${name}(`))) return {};

    function variableOf(node: Rule.Node, name: string) {
      for (let scope: Scope.Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
        const variable = scope.set.get(name);
        if (variable?.defs.length) return variable;
      }

      return undefined;
    }

    function isParameter(node: Rule.Node, name: string, destructured: boolean) {
      const [definition] = variableOf(node, name)?.defs ?? [];
      if (definition?.type !== "Parameter") return false;

      // eslint sets parent on every node, but the type of a scope definition leaves it out
      return !destructured || (definition.name as Rule.Node).parent?.type === "Property";
    }

    function isAmbientActor(call: CallNode, node: Argument) {
      if (node.type === "Identifier") return node.name === "actor" && isParameter(call, "actor", true);

      return (
        node.type === "MemberExpression" &&
        !node.computed &&
        node.property.type === "Identifier" &&
        node.property.name === "actor" &&
        node.object.type === "Identifier" &&
        node.object.name === "ctx" &&
        isParameter(call, "ctx", false)
      );
    }

    return {
      CallExpression(call) {
        if (call.callee.type !== "Identifier" || !CHECKS.has(call.callee.name)) return;
        const { name } = call.callee;
        const [actor, next] = call.arguments;
        if (!actor || !next || !takesActor(call.arguments) || variableOf(call, name)) return;

        if (actor.type === "SpreadElement" || !isAmbientActor(call, actor)) {
          context.report({ node: call, messageId: "manual", data: { name } });
          return;
        }

        context.report({
          node: call,
          messageId: "removed",
          data: { name },
          fix: (fixer) => fixer.removeRange([sourceCode.getRange(actor)[0], sourceCode.getRange(next)[0]]),
        });
      },
    };
  },
};
