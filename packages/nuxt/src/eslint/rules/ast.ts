import type { AST, Rule } from "eslint";

export type CallNode = Parameters<NonNullable<Rule.RuleListener["CallExpression"]>>[0];

export type ExpressionNode = CallNode["arguments"][number] | CallNode["callee"];

export type TemplateAttribute = {
  directive: boolean;
  loc: AST.SourceLocation;
  key: { name: string | { name: string }; argument?: { type: string; name?: string } | null };
  value: { type: "VLiteral"; value: string } | { type: "VExpressionContainer"; expression: CallNode["arguments"][number] | null } | null;
};

export type TemplateElement = { rawName: string; startTag: { attributes: TemplateAttribute[] } };

type TemplateVisitor = Record<string, (node: never) => void>;

export type TemplateServices = {
  defineTemplateBodyVisitor?: (template: TemplateVisitor, script: Rule.RuleListener) => Rule.RuleListener;
};

export function calleeName(callee: CallNode["callee"]) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") return callee.property.name;

  return undefined;
}

export function staticText(node: ExpressionNode | null | undefined) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;

  return undefined;
}
