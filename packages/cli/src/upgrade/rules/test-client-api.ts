import type { Rule, Scope, SourceCode } from "eslint";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type ObjectPatternNode = Extract<EstreeNode, { type: "ObjectPattern" }>;

type MemberNode = Extract<EstreeNode, { type: "MemberExpression" }>;

const CLIENTS = new Set(["actingAs", "guest", "signIn"]);

function trpcMember(node: EstreeNode | undefined): node is MemberNode {
  return node?.type === "MemberExpression" && !node.computed && node.property.type === "Identifier" && node.property.name === "trpc";
}

function nameTaken(scopeManager: Scope.ScopeManager | null, name: string) {
  return (scopeManager?.scopes ?? []).some((scope) => scope.set.has(name) || scope.through.some((reference) => reference.identifier.name === name));
}

function localFunction(scope: Scope.Scope, name: string) {
  for (let current: Scope.Scope | null = scope; current; current = current.upper) {
    const variable = current.set.get(name);
    if (variable) return variable.defs.some((def) => def.type !== "ImportBinding");
  }

  return false;
}

export const testClientApi: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Renames trpc of the test client of actingAs(), guest() and signIn() to api." },
    messages: {
      renamed: "The test client of actingAs(), guest() and signIn() exposes api in place of trpc",
      manual: "The test client of actingAs(), guest() and signIn() exposes api in place of trpc: if this is one, read .api here by hand",
      defaulted: "The test client of actingAs(), guest() and signIn() exposes api in place of trpc: rename this destructured trpc with its default by hand",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const { text } = sourceCode;

    if (!/\btrpc\b/.test(text) || ![...CLIENTS].some((name) => text.includes(name))) return {};

    const renamed = new Set<EstreeNode>();
    const members: MemberNode[] = [];
    let called = false;

    function rename(member: MemberNode) {
      renamed.add(member);
      context.report({ node: member.property, messageId: "renamed", fix: (fixer) => fixer.replaceText(member.property, "api") });
    }

    function renamePattern(pattern: ObjectPatternNode, declared: Scope.Variable[]) {
      for (const property of pattern.properties) {
        if (property.type !== "Property" || property.computed || property.key.type !== "Identifier" || property.key.name !== "trpc") continue;

        const { key, value } = property;

        if (!property.shorthand) {
          context.report({ node: key, messageId: "renamed", fix: (fixer) => fixer.replaceText(key, "api") });
          continue;
        }

        if (value.type !== "Identifier") {
          context.report({ node: key, messageId: "defaulted" });
          continue;
        }

        const variable = declared.find((candidate) => candidate.name === "trpc");

        if (!variable || nameTaken(sourceCode.scopeManager, "api")) {
          context.report({ node: key, messageId: "renamed", fix: (fixer) => fixer.replaceText(property, "api: trpc") });
          continue;
        }

        context.report({
          node: key,
          messageId: "renamed",
          fix: (fixer) => [
            fixer.replaceText(property, "api"),
            ...variable.references.flatMap(({ identifier }) => {
              if (identifier === value || identifier.type !== "Identifier") return [];
              const parent = sourceCode.getAncestors(identifier).at(-1);
              const shorthand = parent?.type === "Property" && parent.shorthand && parent.value === identifier;
              return [fixer.replaceText(identifier, shorthand ? "trpc: api" : "api")];
            }),
          ],
        });
      }
    }

    function follow(client: EstreeNode) {
      const parent = sourceCode.getAncestors(client).at(-1);

      if (trpcMember(parent) && parent.object === client) return rename(parent);
      if (parent?.type === "AssignmentExpression" && parent.right === client && parent.left.type === "ObjectPattern") return renamePattern(parent.left, []);
      if (parent?.type !== "VariableDeclarator" || parent.init !== client) return;
      if (parent.id.type === "ObjectPattern") return renamePattern(parent.id, sourceCode.getDeclaredVariables(parent));

      const [variable] = sourceCode.getDeclaredVariables(parent);

      for (const { identifier } of variable?.references ?? []) {
        if (identifier.type !== "Identifier") continue;
        const member = sourceCode.getAncestors(identifier).at(-1);
        if (identifier !== parent.id && trpcMember(member) && member.object === identifier) rename(member);
      }
    }

    return {
      CallExpression(call) {
        if (call.callee.type !== "Identifier" || !CLIENTS.has(call.callee.name) || localFunction(sourceCode.getScope(call), call.callee.name)) return;

        const parent = sourceCode.getAncestors(call).at(-1);

        called = true;
        follow(parent?.type === "AwaitExpression" && parent.argument === call ? parent : call);
      },
      MemberExpression(member) {
        if (trpcMember(member)) members.push(member);
      },
      "Program:exit"() {
        if (called) for (const member of members) if (!renamed.has(member)) context.report({ node: member.property, messageId: "manual" });
      },
    };
  },
};
