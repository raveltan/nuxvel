import { z } from "zod";

/**
 * The input of a paginated list: an optional `page`, `perPage` and `q`
 * search text of at most 200 characters. Numeric strings become numbers, so it also parses a
 * page's `route.query`.
 *
 * Auto-imported on the server and in the app. Pass the parsed `page` and
 * `perPage` to {@link paginate}, which clamps them, and match `q` in
 * the query yourself.
 *
 * @example
 * ```ts
 * list: publicProcedure
 *   .input(paginationSchema)
 *   .query(({ input }) => paginate(postsQuery(input.q), input)),
 * ```
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().optional(),
  perPage: z.coerce.number().int().optional(),
  q: z.string().trim().max(200).optional(),
});

/** The input {@link paginationSchema} parses. */
export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * One page of rows and where it sits in the full list, as
 * {@link paginate} returns it.
 *
 * Auto-imported as a type on the server and in the app.
 */
export interface Paginated<TRow> {
  /** The rows of this page. */
  rows: TRow[];
  /** The page number, from 1. */
  page: number;
  /** The most rows a page holds. */
  perPage: number;
  /** The number of rows on all pages. */
  total: number;
  /** The number of the last page. It is 1 when there are no rows. */
  lastPage: number;
}

/**
 * Builds the Zod schema of one page of rows, the shape {@link paginate}
 * returns.
 *
 * Auto-imported on the server and in the app. Use it as the `.output()`
 * of a procedure that returns `paginate(...)`. The OpenAPI document then
 * shows the page shape. Its inferred type is {@link Paginated} of the
 * row type.
 *
 * @param row The schema of one row.
 *
 * @example
 * ```ts
 * list: publicProcedure
 *   .input(paginationSchema.optional())
 *   .output(paginated(postSchema))
 *   .query(({ input }) => paginate(postsQuery(input?.q), { page: input?.page, perPage: input?.perPage })),
 * ```
 */
export function paginated<TRow extends z.ZodType>(row: TRow) {
  return z.object({
    rows: z.array(row),
    page: z.number().int(),
    perPage: z.number().int(),
    total: z.number().int(),
    lastPage: z.number().int(),
  });
}

/**
 * One page of rows by key and the cursor of the next page, as
 * {@link paginateCursor} returns it.
 *
 * Auto-imported as a type on the server and in the app.
 */
export interface CursorPage<TRow, TCursor> {
  /** The rows of this page. */
  rows: TRow[];
  /** The `cursor` of the next page, or `null` on the last page. */
  nextCursor: TCursor | null;
}
