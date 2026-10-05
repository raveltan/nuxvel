import { type PgTable, getTableConfig } from "drizzle-orm/pg-core";

const NUXVEL_TABLES = new Set([
  "account",
  "api_keys",
  "audit_context",
  "audit_log",
  "audit_subjects",
  "backfills",
  "billing_customers",
  "billing_events",
  "billing_payments",
  "billing_subscriptions",
  "flag_conversions",
  "flag_exposures",
  "mail_suppressions",
  "notifications",
  "outbox",
  "push_subscriptions",
  "webhook_endpoints",
  "session",
  "two_factor",
  "verification",
]);

export function volumeTables(tables: PgTable[]) {
  const configs = tables.map((table) => ({ table, config: getTableConfig(table) }));
  const skipped = new Map<string, string>();

  for (const { config } of configs) {
    if (NUXVEL_TABLES.has(config.name)) skipped.set(config.name, "a table of nuxvel");
    else if (config.columns.some((column) => column.getSQLType() === "tsvector")) skipped.set(config.name, "it has a tsvector column");
  }

  for (let changed = true; changed; ) {
    changed = false;
    for (const { config } of configs) {
      if (skipped.has(config.name)) continue;
      const target = config.foreignKeys
        .map((key) => getTableConfig(key.reference().foreignTable).name)
        .find((name) => skipped.has(name) && name !== config.name);
      if (target) {
        skipped.set(config.name, `it references ${target}`);
        changed = true;
      }
    }
  }

  return {
    filled: configs.filter(({ config }) => !skipped.has(config.name)).map(({ table }) => table),
    skipped,
  };
}
