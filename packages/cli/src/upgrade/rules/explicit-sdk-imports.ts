import type { Rule } from "eslint";

const SUBPATHS: Record<string, string> = {
  useS3: "@nuxvel/nuxt/storage",
  useQueue: "@nuxvel/nuxt/queue",
  useRedis: "@nuxvel/nuxt/redis",
  useStripe: "@nuxvel/nuxt/billing",
};

export const explicitSdkImports: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Imports useS3(), useQueue(), useRedis() and useStripe() from their subpaths of @nuxvel/nuxt." },
    messages: { missing: "no longer auto-imported: {{names}}, import each from its subpath of @nuxvel/nuxt" },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!Object.keys(SUBPATHS).some((name) => sourceCode.text.includes(name))) return {};

    return {
      "Program:exit"(program) {
        const unresolved = sourceCode.getScope(program).through.map((reference) => reference.identifier.name);
        const names = Object.keys(SUBPATHS).filter((name) => unresolved.includes(name));
        if (names.length === 0) return;

        const lines = names.map((name) => `import { ${name} } from "${SUBPATHS[name]}";`).join("\n");
        const imports = program.body.filter((statement) => statement.type === "ImportDeclaration");
        const lastImport = imports[imports.length - 1];

        context.report({
          node: program,
          loc: { line: 1, column: 0 },
          messageId: "missing",
          data: { names: names.map((name) => `${name}()`).join(", ") },
          fix: (fixer) => (lastImport ? fixer.insertTextAfter(lastImport, `\n${lines}`) : fixer.insertTextBeforeRange([0, 0], `${lines}\n\n`)),
        });
      },
    };
  },
};
