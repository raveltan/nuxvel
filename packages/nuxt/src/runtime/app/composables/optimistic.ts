import type { EntryKeyTagged } from "@pinia/colada";

/**
 * Which cache entry an optimistic mutation patches, and how: the
 * `optimistic` option of `$api.<path>.useMutation()` and
 * `.mutationOptions()`.
 */
export interface OptimisticUpdate<TVars, TData> {
  /** The query to patch, usually `$api.<path>.key(input)`. */
  key: (vars: TVars) => EntryKeyTagged<TData, unknown>;
  /** Derives the optimistic value from what is cached now, such as {@link removeRow}. */
  apply: (current: TData, vars: TVars) => TData;
}
