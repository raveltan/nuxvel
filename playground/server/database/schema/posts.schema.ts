import { index, pgTable, serial, text } from "drizzle-orm/pg-core";
import { belongsTo, searchable, searchIndex, softDeletes, timestamps } from "@nuxvel/nuxt/database";
import { userTable } from "./auth.schema";

export const postsTable = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    authorId: belongsTo(userTable),
    ...searchable(["title", "body"]),
    ...timestamps(),
    ...softDeletes(),
  },
  (table) => [index("posts_author_id_idx").on(table.authorId), searchIndex(table)],
);
