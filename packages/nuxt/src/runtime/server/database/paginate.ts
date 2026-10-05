import { sql } from "drizzle-orm";
import type { PgSelect } from "drizzle-orm/pg-core";
import type { Paginated } from "../../shared/pagination/pagination";
import { useDb } from "./client";

const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/**
 * Runs one page of a Drizzle select and counts the rows on all pages.
 *
 * Auto-imported on the server. Pass the query with `.$dynamic()` and
 * without `.limit()` or `.offset()`. Give it an `.orderBy()`, or rows can
 * move between pages. `page` is at least 1. `perPage` is 20 when it is
 * not set, and between 1 and 100. The count is a second query, which
 * runs only when the page is full or empty. Both queries join the
 * ambient transaction.
 *
 * @param options.page The page number, from 1.
 * @param options.perPage The most rows a page holds.
 *
 * @example
 * ```ts
 * const page = await paginate(
 *   useDb().select().from(postsTable).orderBy(desc(postsTable.createdAt)).$dynamic(),
 *   input,
 * );
 * ```
 */
export async function paginate<TQuery extends PgSelect>(
  query: TQuery,
  options: { page?: number; perPage?: number } = {},
): Promise<Paginated<Awaited<TQuery>[number]>> {
  const perPage = Math.min(Math.max(Math.floor(options.perPage ?? DEFAULT_PER_PAGE), 1), MAX_PER_PAGE);
  const page = Math.max(Math.floor(options.page ?? 1), 1);
  const offset = (page - 1) * perPage;
  const countQuery = useDb().$count(sql`(${query.getSQL()}) as paginated`);
  const rows: Awaited<TQuery> = await query.limit(perPage).offset(offset);
  const total = rows.length < perPage && (rows.length > 0 || offset === 0)
    ? offset + rows.length
    : await countQuery;

  return { rows, page, perPage, total, lastPage: Math.max(Math.ceil(total / perPage), 1) };
}
