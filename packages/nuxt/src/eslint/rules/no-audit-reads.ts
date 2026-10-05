import type { Rule } from "eslint";
import { staticText } from "./ast";

const AUDIT_TABLES = new Set(["audit_log", "audit_subjects", "audit_context"]);
const AUDIT_TABLE_NAMES = new Set(["auditLogTable", "auditSubjectsTable", "auditContextTable"]);
const AUDIT_SCHEMA = /(?:^|\/)audit-log\.schema(?:\.[cm]?[jt]s)?$/;
const AUDIT_TABLE_WORD = /\baudit_(?:log|subjects|context)\b/;

export const noAuditReads: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "App code does not read the audit tables: the audit log is for compliance only." },
    messages: {
      read: "app code may not read the audit tables, the audit log is for compliance only: keep the history of a feature in its own table",
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === "string" && AUDIT_SCHEMA.test(node.source.value)) {
          context.report({ node, messageId: "read" });
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier" && AUDIT_TABLE_NAMES.has(specifier.imported.name)) {
            context.report({ node: specifier, messageId: "read" });
          }
        }
      },
      MemberExpression(node) {
        if (!node.computed && node.property.type === "Identifier" && AUDIT_TABLE_NAMES.has(node.property.name)) {
          context.report({ node, messageId: "read" });
        }
      },
      CallExpression(node) {
        const [name] = node.arguments;
        const { callee } = node;

        if (callee.type === "MemberExpression" && callee.object.type === "Identifier" && callee.object.name === "sql" && callee.property.type === "Identifier" && callee.property.name === "raw") {
          const text = staticText(name);
          if (text !== undefined && AUDIT_TABLE_WORD.test(text)) context.report({ node, messageId: "read" });
          return;
        }

        if (callee.type !== "Identifier" || callee.name !== "schemaTable") return;
        if (name?.type === "Literal" && typeof name.value === "string" && AUDIT_TABLES.has(name.value)) {
          context.report({ node, messageId: "read" });
        }
      },
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
        if (node.quasi.quasis.some((quasi) => AUDIT_TABLE_WORD.test(quasi.value.cooked ?? quasi.value.raw))) {
          context.report({ node, messageId: "read" });
        }
      },
    };
  },
};
