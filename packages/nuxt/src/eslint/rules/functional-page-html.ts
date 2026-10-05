import type { Rule, Scope } from "eslint";
import { RESERVED_PREFIXES } from "../../reserved-prefixes";
import { type CallNode, calleeName, type ExpressionNode } from "./ast";

function staticTail(node: ExpressionNode | undefined) {
  if (node?.type === "TemplateLiteral") return node.quasis.at(-1)?.value.cooked ?? undefined;

  return undefined;
}

function hasExtension(path: string) {
  return ((path.split(/[?#]/, 1)[0] ?? "").split("/").pop() ?? "").includes(".");
}

function staticHead(node: ExpressionNode | undefined) {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral") return node.quasis[0]?.value.cooked ?? undefined;

  return undefined;
}

function isPagePath(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix) && /^([/?#]|$)/.test(path.slice(prefix.length)))) return false;

  return !hasExtension(path);
}

function isPageTarget(node: ExpressionNode | undefined) {
  const head = staticHead(node);
  const tail = staticTail(node);

  return head !== undefined && isPagePath(head) && (tail === undefined || !hasExtension(tail));
}

function typedAsString(node: CallNode) {
  // ESTree types leave out the type arguments that @typescript-eslint/parser adds to a call.
  const params = (node as CallNode & { typeArguments?: { params: { type: string }[] } }).typeArguments?.params;

  return params?.length === 1 && params[0]?.type === "TSStringKeyword";
}

function asksForHtml(node: CallNode) {
  const options = node.arguments[1];

  if (options?.type !== "ObjectExpression") return false;

  return options.properties.some(
    (property) =>
      property.type === "Property" &&
      property.value.type === "ObjectExpression" &&
      property.value.properties.some(
        (header) =>
          header.type === "Property" &&
          (header.value.type === "Literal" || header.value.type === "TemplateLiteral") &&
          staticHead(header.value)?.includes("text/html"),
      ),
  );
}

/**
 * The `nuxvel/functional-page-html` rule: a functional test does not read
 * the HTML of a page. It reports a `$fetch` of a page path, a
 * `$fetch<string>` of a path that is not static, and `.text()` of a
 * `fetch` of a page path or of a `fetch` with an `accept: text/html`
 * header. A page path starts with `/`, is not under `/api`, `/webhooks`
 * or `/_nuxvel`, and has no file extension, also at the end of a template. It is part of the `nuxvel` ESLint plugin.
 */
export const functionalPageHtml: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A functional test checks server behaviour. A story or an end-to-end test checks what a page shows." },
    messages: {
      pageHtml:
        "{{what}} reads the HTML of a page in a functional test: check what the page shows in a story play function (nuxvel test:ui) or with visit() (nuxvel test:e2e), and keep the status, redirect and data checks here",
    },
    schema: [],
  },
  create(context) {
    const pageFetches = new Map<Scope.Variable, string>();

    return {
      CallExpression(node) {
        const name = calleeName(node.callee);
        const head = staticHead(node.arguments[0]);

        if (name === "$fetch" && (head === undefined ? typedAsString(node) : isPageTarget(node.arguments[0]))) {
          context.report({ node, messageId: "pageHtml", data: { what: context.sourceCode.getText(node.callee) } });
          return;
        }

        if (name !== "fetch" || !(isPageTarget(node.arguments[0]) || asksForHtml(node))) return;

        const parent = node.parent.type === "AwaitExpression" ? node.parent.parent : node.parent;

        if (parent.type !== "VariableDeclarator") return;

        for (const variable of context.sourceCode.getDeclaredVariables(parent)) {
          pageFetches.set(variable, context.sourceCode.getText(node));
        }
      },
      MemberExpression(node) {
        if (node.object.type !== "Identifier" || node.property.type !== "Identifier" || node.property.name !== "text") return;

        const { object } = node;
        const variable = context.sourceCode.getScope(node).references.find((reference) => reference.identifier === object)?.resolved;
        const fetched = variable && pageFetches.get(variable);

        if (fetched) context.report({ node, messageId: "pageHtml", data: { what: `${object.name}.text() of ${fetched}` } });
      },
    };
  },
};
