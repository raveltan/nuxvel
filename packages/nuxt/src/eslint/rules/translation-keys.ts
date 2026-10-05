import type { Rule } from "eslint";
import { type CallNode, calleeName, staticText, type TemplateElement, type TemplateServices } from "./ast";

const TRANSLATE = new Set(["$t", "$ts", "$tc", "t", "ts", "tc"]);

type Options = { locale?: string; keys?: string[] };

function literalKeys(node: CallNode["arguments"][number] | null | undefined): string[] {
  const text = staticText(node);
  if (text !== undefined) return [text];
  if (node?.type === "ConditionalExpression") return [...literalKeys(node.consequent), ...literalKeys(node.alternate)];
  return [];
}

export const translationKeys: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A literal translation key passed to $t, $ts, $tc or <i18n-t keypath> is in a translation file of the default locale." },
    messages: { unknownKey: '"{{key}}" is in no {{locale}}.json, add it to the translation file of the default locale' },
    schema: [
      {
        type: "object",
        properties: { locale: { type: "string" }, keys: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const [options = {}] = context.options as Options[];

    if (!options.keys) return {};

    const known = new Set(options.keys);
    const locale = options.locale ?? "en";

    function check(keys: string[], report: (key: string) => void) {
      for (const key of keys) if (!known.has(key)) report(key);
    }

    function checkCall(node: CallNode) {
      const name = calleeName(node.callee);

      if (!name || !TRANSLATE.has(name)) return;

      check(literalKeys(node.arguments[0]), (key) => context.report({ node, messageId: "unknownKey", data: { key, locale } }));
    }

    const script: Rule.RuleListener = { CallExpression: checkCall };
    const services: TemplateServices = context.sourceCode.parserServices;

    if (!services.defineTemplateBodyVisitor) return script;

    return services.defineTemplateBodyVisitor(
      {
        CallExpression: checkCall,
        VElement(element: TemplateElement) {
          if (element.rawName.toLowerCase() !== "i18n-t") return;

          for (const attribute of element.startTag.attributes) {
            if (attribute.directive || attribute.key.name !== "keypath" || attribute.value?.type !== "VLiteral") continue;

            check([attribute.value.value], (key) => context.report({ loc: attribute.loc, messageId: "unknownKey", data: { key, locale } }));
          }
        },
      },
      script,
    );
  },
};
