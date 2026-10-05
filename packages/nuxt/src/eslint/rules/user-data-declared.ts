import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Rule } from "eslint";

const UNDECLARED_TABLES = new Set(["session", "account", "two_factor", "audit_subjects"]);

function declaredTables(filename: string) {
  const privacyDir = join(filename.replace(/[\\/](database[\\/]schema|domains[\\/][^\\/]+[\\/]schema)[\\/].*$/, ""), "privacy");
  const tables = new Set<string>();

  if (!existsSync(privacyDir)) return tables;

  for (const file of readdirSync(privacyDir, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".ts")) continue;

    for (const match of readFileSync(join(privacyDir, file), "utf8").matchAll(/defineUserData\(\s*([\w$]+)/g)) {
      if (match[1]) tables.add(match[1]);
    }
  }

  return tables;
}

export const userDataDeclared: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "A table with a column that references the user table is declared with defineUserData() in server/privacy/." },
    messages: {
      undeclared:
        "column {{column}} of table {{table}} references the user table but no defineUserData() in server/privacy/, declare it so exportUserData() and eraseUserData() find its rows",
    },
    schema: [],
  },
  create(context) {
    let declared: Set<string> | undefined;

    return {
      VariableDeclarator(node) {
        const { id, init } = node;

        if (id.type !== "Identifier" || init?.type !== "CallExpression") return;
        if (init.callee.type !== "Identifier" || init.callee.name !== "pgTable") return;

        const [sqlName, columns] = init.arguments;

        if (sqlName?.type === "Literal" && typeof sqlName.value === "string" && UNDECLARED_TABLES.has(sqlName.value)) return;
        if (columns?.type !== "ObjectExpression") return;

        const sourceCode = context.sourceCode;
        const userColumn = columns.properties.find(
          (property) =>
            property.type === "Property" &&
            property.key.type === "Identifier" &&
            (property.key.name === "userId" || /\.references\(\s*\(\)\s*=>\s*userTable\.id\b/.test(sourceCode.getText(property.value))),
        );

        if (userColumn?.type !== "Property" || userColumn.key.type !== "Identifier") return;

        declared ??= declaredTables(context.filename);

        if (!declared.has(id.name)) context.report({ node, messageId: "undeclared", data: { table: id.name, column: userColumn.key.name } });
      },
    };
  },
};
