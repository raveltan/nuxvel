import { isNull } from "drizzle-orm";
import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const outboxTable = pgTable(
  "outbox",
  {
    id: serial("id").primaryKey(),
    jobName: text("job_name").notNull(),
    payload: jsonb("payload"),
    delay: integer("delay"),
    priority: integer("priority"),
    dispatchedAt: timestamp("dispatched_at"),
  },
  (table) => [index("outbox_undispatched_idx").on(table.id).where(isNull(table.dispatchedAt))],
);
