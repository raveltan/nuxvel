import type { Rule, Scope, SourceCode } from "eslint";
import { type ProcedureTemplateContainer, withTemplateContainers } from "./procedure-composables.ts";

type EstreeNode = Parameters<SourceCode["getAncestors"]>[0];

type ObjectPatternNode = Extract<EstreeNode, { type: "ObjectPattern" }>;

const UPLOADING = /\buploading\b/g;

function isUseUpload(node: EstreeNode | undefined) {
  return node?.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "useUpload";
}

export const uploadPending: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Renames uploading of useUpload() to isPending." },
    messages: {
      renamed: "useUpload() returns isPending in place of uploading",
      manual: "useUpload() returns isPending in place of uploading: rename this destructured uploading with its default by hand",
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const { text } = sourceCode;

    if (!text.includes("useUpload") || !text.includes("uploading")) return {};

    const containers: ProcedureTemplateContainer[] = [];
    const variables: Scope.Variable[] = [];

    function renamePattern(pattern: ObjectPatternNode) {
      const keepLocal = (text.match(UPLOADING)?.length ?? 0) > 1 || /\bisPending\b/.test(text);

      for (const property of pattern.properties) {
        if (property.type !== "Property" || property.computed || property.key.type !== "Identifier" || property.key.name !== "uploading") continue;

        const { key, shorthand } = property;

        if (shorthand && property.value.type === "AssignmentPattern") {
          context.report({ node: key, messageId: "manual" });
          continue;
        }

        context.report({
          node: key,
          messageId: "renamed",
          fix: (fixer) => (shorthand ? fixer.replaceText(property, keepLocal ? "isPending: uploading" : "isPending") : fixer.replaceText(key, "isPending")),
        });
      }
    }

    function renameRead(object: EstreeNode) {
      const member = sourceCode.getAncestors(object).at(-1);

      if (member?.type !== "MemberExpression" || member.object !== object || member.computed) return;
      if (member.property.type !== "Identifier" || member.property.name !== "uploading") return;

      const { property } = member;

      context.report({ node: property, messageId: "renamed", fix: (fixer) => fixer.replaceText(property, "isPending") });
    }

    const script: Rule.RuleListener = {
      CallExpression(call) {
        if (!isUseUpload(call)) return;

        renameRead(call);

        const declarator = sourceCode.getAncestors(call).at(-1);
        if (declarator?.type !== "VariableDeclarator" || declarator.init !== call) return;
        if (declarator.id.type === "ObjectPattern") return renamePattern(declarator.id);

        const [variable] = sourceCode.getDeclaredVariables(declarator);
        if (!variable) return;

        variables.push(variable);
        for (const { identifier } of variable.references) if (identifier.type === "Identifier" && identifier !== declarator.id) renameRead(identifier);
      },
      "Program:exit"() {
        const names = new Set(variables.filter((variable) => variable.scope.type === "module").map((variable) => variable.name));

        for (const { references } of containers) {
          for (const { id, variable } of references) if (variable === null && names.has(id.name)) renameRead(id);
        }
      },
    };

    return withTemplateContainers(context, containers, script);
  },
};
