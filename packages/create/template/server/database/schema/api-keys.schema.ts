import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { belongsTo, now } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const apiKeysTable = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    keyHash: text("key_hash").notNull().unique(),
    userId: belongsTo(userTable),
    name: text("name").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
  },
  (table) => [index("api_keys_user_id_idx").on(table.userId)],
);
