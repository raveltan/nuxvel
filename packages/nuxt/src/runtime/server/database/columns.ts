import { timestamp } from "drizzle-orm/pg-core";
import { now } from "../clock/now";

/**
 * `created_at` and `updated_at` columns, both `NOT NULL DEFAULT now()`,
 * with `updated_at` refreshed on every update. Drizzle fills both from
 * {@link now} on insert, so a test clock reaches them.
 *
 * Spread into a table definition. Schema files import it from
 * `@nuxvel/nuxt/database`, since `drizzle-kit` loads them outside Nuxt.
 *
 * @example
 * ```ts
 * import { timestamps } from "@nuxvel/nuxt/database";
 *
 * export const posts = pgTable("posts", {
 *   id: serial("id").primaryKey(),
 *   title: text("title").notNull(),
 *   ...timestamps(),
 * });
 * ```
 */
export function timestamps() {
  return {
    createdAt: timestamp("created_at").notNull().defaultNow().$defaultFn(now),
    updatedAt: timestamp("updated_at").notNull().defaultNow().$defaultFn(now).$onUpdate(now),
  };
}

/**
 * A nullable `deleted_at` column (`timestamptz`) that marks a row as
 * soft-deleted.
 *
 * Spread into a table definition, next to {@link timestamps}. Schema
 * files import it from `@nuxvel/nuxt/database`. nuxvel never hides
 * trashed rows from a plain Drizzle query: filter with `notTrashed()`,
 * and write with `softDelete()`, `restore()` and `forceDelete()`.
 * `findOrFail()` skips trashed rows unless told otherwise.
 *
 * @example
 * ```ts
 * import { softDeletes, timestamps } from "@nuxvel/nuxt/database";
 *
 * export const posts = pgTable("posts", {
 *   id: serial("id").primaryKey(),
 *   title: text("title").notNull(),
 *   ...timestamps(),
 *   ...softDeletes(),
 * });
 * ```
 */
export function softDeletes() {
  return {
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}
