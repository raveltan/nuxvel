import type { Paginated } from "../../shared/pagination/pagination";

type Row = { id?: unknown };

const sameId = (row: Row, target: Row) => row.id === target.id;

function withRows<TList extends Paginated<unknown>>(list: TList, rows: TList["rows"], total: number): TList {
  return { ...list, rows, total, lastPage: Math.max(1, Math.ceil(total / list.perPage)) };
}

/**
 * Returns a patch that removes a row from a {@link Paginated} page and
 * lowers `total` and `lastPage` to match. A page without the row comes
 * back unchanged.
 *
 * Auto-imported. Use it as the `apply` of a mutation's `optimistic`
 * option or as a patch in the `on` of `useLiveQuery()`. See
 * {@link prependRow} and {@link replaceRow}.
 *
 * @param match Whether a row is the one to remove. The default compares `id`.
 *
 * @example
 * ```ts
 * const deletePost = $api.post.delete.useMutation({
 *   optimistic: { key: () => $api.post.list.key(input.value), apply: removeRow() },
 * });
 * ```
 */
export function removeRow(): <TList extends Paginated<Row>>(list: TList, target: Row) => TList;
export function removeRow<TRow, TTarget>(
  match: (row: TRow, target: TTarget) => boolean,
): <TList extends Paginated<TRow>>(list: TList, target: TTarget) => TList;
export function removeRow(match: (row: Row, target: Row) => boolean = sameId) {
  return <TList extends Paginated<Row>>(list: TList, target: Row) => {
    const rows = list.rows.filter((row) => !match(row, target));

    return rows.length === list.rows.length ? list : withRows(list, rows, list.total - (list.rows.length - rows.length));
  };
}

/**
 * Returns a patch that adds a row at the top of a {@link Paginated}
 * page, keeps the page at `perPage` rows and raises `total` and
 * `lastPage` to match. A row whose `id` the page already holds is
 * skipped, so a broadcast of a row the query fetched already adds
 * nothing.
 *
 * Auto-imported. Use it in the `on` of `useLiveQuery()` or as the
 * `apply` of a mutation's `optimistic` option. See {@link removeRow}
 * and {@link replaceRow}.
 *
 * @param options.when Whether to add the row to this page, for example
 * only on the first page.
 *
 * @example
 * ```ts
 * const posts = useLiveQuery(() => $api.post.list.queryOptions(input.value), {
 *   channel: "posts",
 *   on: { created: prependRow({ when: (list) => list.page === 1 }) },
 * });
 * ```
 */
export function prependRow<TRow extends Row>(options: { when?: (list: Paginated<TRow>, row: TRow) => boolean } = {}) {
  return <TList extends Paginated<TRow>>(list: TList, row: TRow): TList => {
    if (options.when?.(list, row) === false || list.rows.some((existing) => sameId(existing, row))) return list;

    return withRows(list, [row, ...list.rows].slice(0, list.perPage), list.total + 1);
  };
}

/**
 * Returns a patch that merges a change into the matching row of a
 * {@link Paginated} page. `total` stays the same.
 *
 * Auto-imported. Use it as the `apply` of a mutation's `optimistic`
 * option or as a patch in the `on` of `useLiveQuery()`. See
 * {@link removeRow} and {@link prependRow}.
 *
 * @param match Whether a row is the one to change. The default compares `id`.
 *
 * @example
 * ```ts
 * const renamePost = $api.post.update.useMutation({
 *   optimistic: { key: () => $api.post.list.key(input.value), apply: replaceRow() },
 * });
 * ```
 */
export function replaceRow(): <TList extends Paginated<Row>>(list: TList, change: Partial<TList["rows"][number]>) => TList;
export function replaceRow<TRow, TChange extends Partial<TRow>>(
  match: (row: TRow, change: TChange) => boolean,
): <TList extends Paginated<TRow>>(list: TList, change: TChange) => TList;
export function replaceRow(match: (row: Row, change: Row) => boolean = sameId) {
  return <TList extends Paginated<Row>>(list: TList, change: Row): TList => ({
    ...list,
    rows: list.rows.map((row) => (match(row, change) ? { ...row, ...change } : row)),
  });
}
