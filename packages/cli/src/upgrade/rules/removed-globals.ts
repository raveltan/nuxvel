import type { Rule, Scope } from "eslint";

const LITERALS: Record<string, string> = { SYSTEM_ACTOR_TYPE: '"system"', API_KEY_ACTOR_TYPE: '"api-key"' };

function readsUser(node: Rule.Node) {
  const { parent } = node;
  if (parent?.type !== "MemberExpression" || parent.object !== node || parent.computed || parent.property.type !== "Identifier" || parent.property.name !== "user") return false;

  const next = parent.parent;

  return !(next?.type === "MemberExpression" && next.object === parent && !next.optional) && !(next?.type === "CallExpression" && next.callee === parent && !next.optional);
}

function isTypeQuery(node: Rule.Node | null): node is Rule.Node {
  // typescript-eslint's TSTypeQuery is missing from the ESTree node types of eslint
  return (node?.type as string | undefined) === "TSTypeQuery";
}

export const removedGlobals: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Replaces SYSTEM_ACTOR_TYPE and API_KEY_ACTOR_TYPE with their strings, and auth() with useAuth() where only .user is read." },
    messages: {
      literal: "{{name}} is no longer auto-imported: it is the string {{literal}}",
      useAuth: "auth() is no longer auto-imported: useAuth() returns the user",
      manual: "auth() is no longer auto-imported: read the user with (await useAuth()).user, or require a session with requireAuth()",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const { text } = sourceCode;

    if (!text.includes("auth(") && !Object.keys(LITERALS).some((name) => text.includes(name))) return {};

    function declared(node: Rule.Node, name: string) {
      for (let scope: Scope.Scope | null = sourceCode.getScope(node); scope; scope = scope.upper) {
        if (scope.set.get(name)?.defs.length) return true;
      }

      return false;
    }

    function onlyReadsUser(awaited: Rule.Node) {
      if (readsUser(awaited)) return true;

      const declarator = awaited.parent;
      if (declarator?.type !== "VariableDeclarator" || declarator.id.type !== "Identifier" || declarator.init !== awaited) return false;

      const [variable] = sourceCode.getDeclaredVariables(declarator);
      const reads = variable?.references.filter((reference) => !reference.init) ?? [];

      // eslint sets parent on every node, but the type of a scope reference leaves it out
      return reads.every((reference) => reference.identifier.type === "Identifier" && readsUser(reference.identifier as Rule.Node));
    }

    return {
      Identifier(node) {
        const literal = LITERALS[node.name];
        const { parent } = node;
        if (!literal || declared(node, node.name)) return;
        if (parent?.type === "MemberExpression" && parent.property === node && !parent.computed) return;
        if (parent?.type === "Property" && parent.key === node && !parent.computed) return;
        if (parent?.type === "ImportSpecifier" || parent?.type === "ExportSpecifier") return;

        const target = isTypeQuery(parent) ? parent : node;

        context.report({ node, messageId: "literal", data: { name: node.name, literal }, fix: (fixer) => fixer.replaceText(target, literal) });
      },
      CallExpression(call) {
        const { callee } = call;
        if (callee.type !== "Identifier" || callee.name !== "auth" || call.arguments.length > 0 || declared(call, "auth")) return;

        if (call.parent?.type === "AwaitExpression" && onlyReadsUser(call.parent)) {
          context.report({ node: call, messageId: "useAuth", fix: (fixer) => fixer.replaceText(callee, "useAuth") });
          return;
        }

        context.report({ node: call, messageId: "manual" });
      },
    };
  },
};
