import type { Rule } from "eslint";
import { type ExpressionNode, staticText } from "./ast";

const BILLING_TABLES = new Set(["billing_customers", "billing_events", "billing_subscriptions", "billing_payments"]);
const BILLING_TABLE_NAMES = new Set(["billingCustomersTable", "billingEventsTable", "billingSubscriptionsTable", "billingPaymentsTable"]);
const WRITES = new Set(["insert", "update", "delete"]);
const ONE_ROW_WRITES = new Set(["insertOne", "updateOne"]);
const BILLING_WRITE_SQL = /\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:only\s+)?"?billing_(?:customers|events|subscriptions|payments)\b/i;

function namesBillingTable(node: ExpressionNode | undefined): boolean {
  if (!node) return false;
  if (node.type === "Identifier") return BILLING_TABLE_NAMES.has(node.name);
  if (node.type === "MemberExpression") return !node.computed && node.property.type === "Identifier" && BILLING_TABLE_NAMES.has(node.property.name);
  if (node.type !== "CallExpression" || node.callee.type !== "Identifier" || node.callee.name !== "schemaTable") return false;

  const [name] = node.arguments;

  return name?.type === "Literal" && typeof name.value === "string" && BILLING_TABLES.has(name.value);
}

export const billingWrites: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "App code does not write the billing tables: nuxvel writes them from Stripe's events." },
    messages: {
      write: "app code may not write the billing tables, nuxvel writes them from Stripe's events: change the subscription or the payment in Stripe",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        const [table] = node.arguments;

        if (callee.type === "Identifier" && ONE_ROW_WRITES.has(callee.name) && table?.type !== "SpreadElement" && namesBillingTable(table)) {
          context.report({ node, messageId: "write" });
          return;
        }

        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return;

        if (callee.object.type === "Identifier" && callee.object.name === "sql" && callee.property.name === "raw") {
          const text = staticText(node.arguments[0]);
          if (text !== undefined && BILLING_WRITE_SQL.test(text)) context.report({ node, messageId: "write" });
          return;
        }

        if (WRITES.has(callee.property.name) && table?.type !== "SpreadElement" && namesBillingTable(table)) {
          context.report({ node, messageId: "write" });
        }
      },
      TaggedTemplateExpression(node) {
        if (node.tag.type !== "Identifier" || node.tag.name !== "sql") return;
        if (node.quasi.quasis.some((quasi) => BILLING_WRITE_SQL.test(quasi.value.cooked ?? quasi.value.raw))) {
          context.report({ node, messageId: "write" });
        }
      },
    };
  },
};
