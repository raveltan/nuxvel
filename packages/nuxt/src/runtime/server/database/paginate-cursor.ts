import { asc, Column, desc, gt, is, lt } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import type { CursorPage } from "../../shared/pagination/pagination";
import { useDb } from "./client";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Runs one page of a Drizzle select by key: the rows after `cursor` in
 * the order of the `orderBy` column, and the cursor of the next page.
 *
 * Auto-imported on the server. Pass the query with `.$dynamic()`, and
 * without `.orderBy()`, `.limit()` or `.offset()`. `orderBy` names a
 * selected column whose values are unique, such as `id`. `nextCursor`
 * is `null` on the last page. The query joins the ambient transaction.
 * Use {@link paginate} when you need page numbers and a total.
 *
 * @param options.orderBy The key of a unique column in each row.
 * @param options.cursor The `nextCursor` of the previous page. Leave it out for the first page.
 * @param options.limit The most rows a page holds: 20 when not set, between 1 and 100.
 * @param options.direction `"asc"` (the default) or `"desc"`.
 *
 * @example
 * ```ts
 * const page = await paginateCursor(
 *   useDb().select().from(postsTable).where(notTrashed(postsTable)).$dynamic(),
 *   { orderBy: "id", direction: "desc", cursor: input.cursor, limit: 20 },
 * );
 * ```
 */
export async function paginateCursor<
  TQuery extends PgSelect,
  TKey extends keyof TQuery["_"]["selectedFields"] & keyof Awaited<TQuery>[number] & string,
>(
  query: TQuery,
  options: {
    orderBy: TKey;
    cursor?: Awaited<TQuery>[number][TKey] | null;
    limit?: number;
    direction?: "asc" | "desc";
  },
): Promise<CursorPage<Awaited<TQuery>[number], Awaited<TQuery>[number][TKey]>>;
export async function paginateCursor(
  query: PgSelect,
  options: { orderBy: string; cursor?: unknown; limit?: number; direction?: "asc" | "desc" },
): Promise<CursorPage<Record<string, unknown>, unknown>> {
  const limit = Math.min(Math.max(Math.floor(options.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
  const descending = options.direction === "desc";
  const page = query.as("cursor_page");
  const key = page[options.orderBy];

  if (!is(key, Column)) throw new Error(`paginateCursor: "${options.orderBy}" is not a selected column`);

  const after = options.cursor === undefined || options.cursor === null
    ? undefined
    : descending ? lt(key, options.cursor) : gt(key, options.cursor);
  const rows: Record<string, unknown>[] = await useDb()
    .select()
    .from(page)
    .where(after)
    .orderBy(descending ? desc(key) : asc(key))
    .limit(limit + 1);
  const hasMore = rows.length > limit;

  if (hasMore) rows.pop();

  return { rows, nextCursor: hasMore ? rows.at(-1)?.[options.orderBy] : null };
}
