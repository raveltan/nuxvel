import { sql, type AnyColumn } from "drizzle-orm";
import { customType, index, type ExtraConfigColumn } from "drizzle-orm/pg-core";

/** A full-text search weight. `A` ranks highest, `D` ranks lowest. */
export type SearchWeight = "A" | "B" | "C" | "D";

/** A table that has the `searchVector` column from {@link searchable}. */
export type SearchableTable = { searchVector: AnyColumn };

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const DEFAULT_WEIGHTS = ["A", "B", "C", "D"] as const;

function quoteIdentifier(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Adds a stored generated `search_vector` column of type `tsvector`,
 * built from the given text columns.
 *
 * Spread it into a table definition, and return {@link searchIndex} from
 * the table's index callback. Postgres updates the column on every write.
 * Query it with `search`, `searchRank` and `highlight`. Schema files
 * import it from `@nuxvel/nuxt/database`, because `drizzle-kit` loads
 * them outside Nuxt. `select()` and `.returning()` include the column,
 * as `searchVector`.
 *
 * @param columns The database names of the text columns to search.
 * @param options.language The Postgres text search configuration. The default is `"english"`.
 * @param options.weights The weight of each column. The default is `A`, `B`, `C`, then `D`, in the order of `columns`.
 *
 * @example
 * ```ts
 * import { searchable, searchIndex, timestamps } from "@nuxvel/nuxt/database";
 *
 * export const posts = pgTable("posts", {
 *   id: serial("id").primaryKey(),
 *   title: text("title").notNull(),
 *   body: text("body").notNull(),
 *   ...searchable(["title", "body"]),
 *   ...timestamps(),
 * }, (table) => [searchIndex(table)]);
 * ```
 */
export function searchable<TColumn extends string>(
  columns: TColumn[],
  options: { language?: string; weights?: Partial<Record<TColumn, SearchWeight>> } = {},
) {
  const language = options.language ?? "english";

  if (!/^[a-z_]+$/.test(language))
    throw new Error(`searchable(): "${language}" is not a text search configuration name`);

  const vector = columns
    .map((column, position) => {
      const weight = options.weights?.[column] ?? DEFAULT_WEIGHTS[Math.min(position, 3)];

      return `setweight(to_tsvector('${language}', coalesce(${quoteIdentifier(column)}, '')), '${weight}')`;
    })
    .join(" || ");

  return { searchVector: tsvector("search_vector").generatedAlwaysAs(sql.raw(vector)) };
}

/**
 * Returns the GIN index on the `search_vector` column that
 * {@link searchable} adds. Return it from the table's index callback.
 * On a table that exists, `nuxvel db:generate` puts the index in a
 * migration of its own that builds it with `CREATE INDEX CONCURRENTLY`.
 *
 * @example
 * ```ts
 * export const posts = pgTable("posts", { ...columns, ...searchable(["title", "body"]) }, (table) => [
 *   searchIndex(table),
 * ]);
 * ```
 */
export function searchIndex(table: { searchVector: ExtraConfigColumn }) {
  return index().using("gin", table.searchVector);
}
