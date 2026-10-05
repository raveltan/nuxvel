import type { Rule } from "eslint";

const REQUEST_CALLS = new Set([
  "auth",
  "requireAuth",
  "useEvent",
  "getHeader",
  "getHeaders",
  "getRequestHeader",
  "getRequestHeaders",
  "getRequestHost",
  "getRequestIP",
  "getRequestURL",
  "getQuery",
  "getValidatedQuery",
  "getRouterParam",
  "getRouterParams",
  "getValidatedRouterParams",
  "readBody",
  "readRawBody",
  "readValidatedBody",
  "readFormData",
  "readMultipartFormData",
  "getCookie",
  "parseCookies",
  "setCookie",
  "deleteCookie",
  "setHeader",
  "setResponseHeader",
  "setResponseStatus",
  "sendRedirect",
  "useSession",
  "getSession",
]);

function isH3(source: { value?: unknown } | null | undefined) {
  return source?.value === "h3";
}

export const actionImports: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Keep actions free of the request: no h3, no auth(), no request helpers." },
    messages: {
      request:
        "actions may not import h3, call auth() or requireAuth(), or read the request (useEvent, getHeader, readBody, ...)",
    },
    schema: [],
  },
  create(context) {
    const report = (node: Rule.Node) => context.report({ node, messageId: "request" });

    return {
      ImportDeclaration(node) {
        if (isH3(node.source)) report(node);
      },
      ExportNamedDeclaration(node) {
        if (isH3(node.source)) report(node);
      },
      ExportAllDeclaration(node) {
        if (isH3(node.source)) report(node);
      },
      ImportExpression(node) {
        if (node.source.type === "Literal" && isH3(node.source)) report(node);
      },
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;

        const [first] = node.arguments;
        const requiresH3 = node.callee.name === "require" && first?.type === "Literal" && isH3(first);

        if (requiresH3 || REQUEST_CALLS.has(node.callee.name)) report(node);
      },
    };
  },
};
