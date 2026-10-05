import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  changes: jsonb("changes"),
  metadata: jsonb("metadata"),
  requestId: text("request_id"),
  prevHash: text("prev_hash"),
  hash: text("hash").notNull(),
});

export { apiKeysTable } from "../../../../../playground/server/database/schema/api-keys.schema";
export { userTable } from "../../../../../playground/server/database/schema/auth.schema";
export { auditContextTable, auditSubjectsTable } from "../../../../../playground/server/database/schema/audit-log.schema";
export { mailSuppressionsTable } from "../../../../../playground/server/database/schema/mail-suppressions.schema";
export { outboxTable } from "../../../../../playground/server/database/schema/outbox.schema";
