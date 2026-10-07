import type { Rule } from "eslint";

const MODULES: Record<string, string> = {
  $seeders: "#nuxvel/seeders-namespace",
  $backfills: "#nuxvel/backfills-namespace",
};

export const explicitNamespaceImports: Rule.RuleModule = {
  meta: {
    type: "problem",
    fixable: "code",
    docs: { description: "Imports $seeders and $backfills from their namespace modules." },
    messages: { missing: "no longer auto-imported: {{names}}, import each from its namespace module" },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;

    if (!Object.keys(MODULES).some((name) => sourceCode.text.includes(name))) return {};

    return {
      "Program:exit"(program) {
        const unresolved = sourceCode.getScope(program).through.map((reference) => reference.identifier.name);
        const names = Object.keys(MODULES).filter((name) => unresolved.includes(name));
        if (names.length === 0) return;

        const lines = names.map((name) => `import * as ${name} from "${MODULES[name]}";`).join("\n");
        const imports = program.body.filter((statement) => statement.type === "ImportDeclaration");
        const lastImport = imports[imports.length - 1];

        context.report({
          node: program,
          loc: { line: 1, column: 0 },
          messageId: "missing",
          data: { names: names.join(", ") },
          fix: (fixer) => (lastImport ? fixer.insertTextAfter(lastImport, `\n${lines}`) : fixer.insertTextBeforeRange([0, 0], `${lines}\n\n`)),
        });
      },
    };
  },
};
