import type { Rule } from "eslint";
import { RESERVED_PREFIXES } from "../../reserved-prefixes";
import type { CallNode, TemplateElement, TemplateServices } from "./ast";

const LINKS = new Set(["nuxtlink", "ulink", "ubutton"]);
const ROUTERS = new Set(["router", "$router"]);
const ROUTER_METHODS = new Set(["push", "replace"]);

function isInternal(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return false;

  return !RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix) && /^([/?#]|$)/.test(path.slice(prefix.length)));
}

function isRouterCall(callee: CallNode["callee"]) {
  if (callee.type === "Identifier") return callee.name === "navigateTo";
  if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return false;
  if (!ROUTER_METHODS.has(callee.property.name)) return false;

  const { object } = callee;

  if (object.type === "Identifier") return ROUTERS.has(object.name);

  return object.type === "CallExpression" && object.callee.type === "Identifier" && object.callee.name === "useRouter";
}

export const typedRoutes: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Links and navigation use a route name, so the typecheck fails when a page moves." },
    messages: { pathString: "{{path}} is a path string: use a route name, { name: '...' }" },
    schema: [],
  },
  create(context) {
    function pathOf(node: CallNode["arguments"][number] | null | undefined) {
      if (node?.type === "Literal" && typeof node.value === "string") {
        return isInternal(node.value) ? JSON.stringify(node.value) : undefined;
      }

      if (node?.type === "TemplateLiteral" && isInternal(node.quasis[0]?.value.cooked ?? "")) {
        return context.sourceCode.getText(node);
      }

      return undefined;
    }

    function checkCall(node: CallNode) {
      if (!isRouterCall(node.callee)) return;

      const path = pathOf(node.arguments[0]);

      if (path) context.report({ node, messageId: "pathString", data: { path } });
    }

    const script: Rule.RuleListener = { CallExpression: checkCall };
    const services: TemplateServices = context.sourceCode.parserServices;

    if (!services.defineTemplateBodyVisitor) return script;

    return services.defineTemplateBodyVisitor(
      {
        CallExpression: checkCall,
        VElement(element: TemplateElement) {
          if (!LINKS.has(element.rawName.replaceAll("-", "").toLowerCase())) return;

          for (const attribute of element.startTag.attributes) {
            const { key, value } = attribute;
            const isTo = attribute.directive
              ? typeof key.name !== "string" && key.name.name === "bind" && key.argument?.name === "to"
              : key.name === "to";

            if (!isTo || !value) continue;

            const path =
              value.type === "VLiteral" ? (isInternal(value.value) ? JSON.stringify(value.value) : undefined) : pathOf(value.expression);

            if (path) context.report({ loc: attribute.loc, messageId: "pathString", data: { path } });
          }
        },
      },
      script,
    );
  },
};
