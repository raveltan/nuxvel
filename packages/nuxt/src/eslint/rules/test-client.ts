import type { Rule } from "eslint";

const TEST_UTILS = new Set(["@nuxt/test-utils/e2e", "@nuxt/test-utils"]);
const IN_PLACE_OF: Record<string, string> = {
  $fetch: "guest().$fetch or actingAs(user).$fetch",
  fetch: "guest().fetch or actingAs(user).fetch",
  createPage: "visit() or actingAs(user).visit(), which record the errors of the page",
};

/**
 * The `nuxvel/test-client` rule: a test reaches the app through the
 * clients of `@nuxvel/nuxt/testing`. It reports an import of `$fetch`,
 * `fetch` or `createPage` from `@nuxt/test-utils` or
 * `@nuxt/test-utils/e2e`, in place of
 * `guest()`, `actingAs(user)` and `visit()`. It is part of the `nuxvel`
 * ESLint plugin.
 */
export const testClient: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: { description: "A test reaches the app with guest(), actingAs() and visit() of @nuxvel/nuxt/testing." },
    messages: {
      raw: "{{name}} from {{source}}: use {{inPlaceOf}}",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        if (typeof source !== "string" || !TEST_UTILS.has(source)) return;
        // ESTree types leave out the importKind that @typescript-eslint/parser adds.
        if ((node as { importKind?: string }).importKind === "type") return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier" || specifier.imported.type !== "Identifier") continue;
          if ((specifier as { importKind?: string }).importKind === "type") continue;

          const name = specifier.imported.name;
          const inPlaceOf = IN_PLACE_OF[name];

          if (inPlaceOf) context.report({ node: specifier, messageId: "raw", data: { name, source, inPlaceOf } });
        }
      },
    };
  },
};
