import { NotFoundError } from "../errors/taxonomy";

/**
 * Takes the first row of a query result, throwing {@link NotFoundError}
 * (HTTP 404) if there is none.
 *
 * `noUncheckedIndexedAccess` types `rows[0]` as possibly `undefined`; this
 * narrows it without a non-null assertion.
 *
 * @example
 * ```ts
 * const post = await useDb().insert(postsTable).values(row).returning().then(firstOrFail);
 * ```
 */
export function firstOrFail<TRow>(rows: TRow[]): TRow {
  const [row] = rows;

  if (!row) throw new NotFoundError("Query returned no rows");

  return row;
}
