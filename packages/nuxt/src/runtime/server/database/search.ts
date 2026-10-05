import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { SearchableTable } from "./searchable";

type SearchOptions = { language?: string };

function isBlank(q: string) {
  return q.trim() === "";
}

function prefixQuery(q: string, language = "english") {
  return sql`to_tsquery('simple', regexp_replace(websearch_to_tsquery(${language}::regconfig, ${q})::text, '''( |$)', ''':*\\1', 'g'))`;
}

/**
 * Returns a `where` condition that matches the rows of a
 * {@link searchable} table whose text matches `q`.
 *
 * Auto-imported on the server. `q` uses web search syntax: `"quoted
 * phrase"`, `or`, and `-word` to exclude a word. Each word also matches as
 * a prefix, so `pos` finds `posts`. `q` goes to Postgres as a parameter,
 * so user input is safe. A blank `q` matches every row. Combine it with
 * other conditions through `and()`, and order by {@link searchRank}.
 *
 * @param options.language The Postgres text search configuration. Use the same one as `searchable()`. The default is `"english"`.
 *
 * @example
 * ```ts
 * const rows = await useDb()
 *   .select()
 *   .from(postsTable)
 *   .where(search(postsTable, input.q))
 *   .orderBy(desc(searchRank(postsTable, input.q)));
 * ```
 */
export function search(table: SearchableTable, q: string, options: SearchOptions = {}): SQL {
  if (isBlank(q)) return sql`true`;

  return sql`${table.searchVector} @@ ${prefixQuery(q, options.language)}`;
}

/**
 * Returns the rank of each row of a {@link searchable} table for `q`,
 * for `orderBy`. A higher rank is a better match.
 *
 * Auto-imported on the server. A match in a column with weight `A` ranks
 * higher than a match in a column with weight `D`. A blank `q` ranks
 * every row `0`. Use it with {@link search}.
 *
 * @param options.language The Postgres text search configuration. Use the same one as `searchable()`. The default is `"english"`.
 *
 * @example
 * ```ts
 * .orderBy(desc(searchRank(postsTable, input.q)), postsTable.id)
 * ```
 */
export function searchRank(table: SearchableTable, q: string, options: SearchOptions = {}): SQL<number> {
  if (isBlank(q)) return sql<number>`0::real`;

  return sql<number>`ts_rank(${table.searchVector}, ${prefixQuery(q, options.language)})`;
}

/**
 * Returns a snippet of a text column with the words that match `q` in
 * `<mark>` tags, for a search result.
 *
 * Auto-imported on the server. The result is HTML: the column text is
 * escaped, so the snippet is safe to show with `v-html`. The snippet is
 * about 35 words around the best match. A blank `q` returns the whole
 * column, escaped. Use the same `q` as {@link search}.
 *
 * @param options.language The Postgres text search configuration. Use the same one as `searchable()`. The default is `"english"`.
 *
 * @example
 * ```ts
 * const rows = await useDb()
 *   .select({ id: postsTable.id, snippet: highlight(postsTable.body, input.q) })
 *   .from(postsTable)
 *   .where(search(postsTable, input.q));
 * ```
 */
export function highlight(
  column: AnyColumn<{ data: string }>,
  q: string,
  options: SearchOptions = {},
): SQL<string> {
  const escaped = sql`replace(replace(replace(${column}, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')`;

  if (isBlank(q)) return sql<string>`${escaped}`;

  return sql<string>`ts_headline(${options.language ?? "english"}::regconfig, ${escaped}, ${prefixQuery(q, options.language)}, 'StartSel=<mark>, StopSel=</mark>')`;
}
