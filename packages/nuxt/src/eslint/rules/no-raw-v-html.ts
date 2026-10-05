import type { Rule } from "eslint";

type TemplateServices = {
  defineTemplateBodyVisitor?: (visitor: Rule.RuleListener) => Rule.RuleListener;
};

export const noRawVHtml: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Pages and components render user HTML through <SafeHtml>, never through v-html." },
    messages: { vHtml: "v-html renders HTML that nothing sanitized, use <SafeHtml :html> with sanitizeHtml() output" },
    schema: [],
  },
  create(context) {
    const services: TemplateServices = context.sourceCode.parserServices;

    if (!services.defineTemplateBodyVisitor) return {};

    return services.defineTemplateBodyVisitor({
      "VAttribute[directive=true][key.name.name='html']"(node: Rule.Node) {
        context.report({ node, messageId: "vHtml" });
      },
    });
  },
};
