import { integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { now } from "@nuxvel/nuxt/database";

export const auditLogTable = pgTable("audit_log", {
  id: serial("id").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow().$defaultFn(now),
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
}, (table) => [primaryKey({ columns: [table.id, table.occurredAt] })]);

export const auditSubjectsTable = pgTable("audit_subjects", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name"),
  mac: text("mac"),
});

export const auditContextTable = pgTable("audit_context", {
  entryId: integer("entry_id").primaryKey(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  mac: text("mac"),
});
