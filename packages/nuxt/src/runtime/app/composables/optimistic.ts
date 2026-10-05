import { useQueryCache, type EntryKeyTagged } from "@pinia/colada";

/**
 * Which cache entry an optimistic mutation patches, and how. Passed to
 * {@link optimistic}.
 */
export interface OptimisticUpdate<TVars, TData> {
  /** The query to patch, usually `useTRPC().<path>.key(input)`. */
  key: (vars: TVars) => EntryKeyTagged<TData, unknown>;
  /** Derives the optimistic value from what is cached now. */
  apply: (current: TData, vars: TVars) => TData;
}

/**
 * Adds optimistic-update hooks to a mutation's options.
 *
 * Auto-imported. Call it inside `setup()`, since it reads the query cache.
 * Before the mutation runs, the query at `key` is cancelled and patched
 * with `apply`; if the mutation throws, the previous value is restored;
 * once it settles either way, the query is invalidated so the server's
 * response confirms it. Nothing is patched when the query is not cached.
 * An `onError` spread into the options still runs, after the rollback;
 * an `onMutate` or `onSettled` of the options is replaced.
 *
 * The type of the mutation's `error` is `Error`, or the `TError` of `mutationOptions`.
 *
 * @param mutationOptions - Usually `useTRPC().<path>.mutationOptions()`.
 * @param update - The {@link OptimisticUpdate} to apply.
 *
 * @example
 * ```ts
 * const trpc = useTRPC();
 * const { mutate: renamePost } = useMutation(
 *   optimistic(trpc.post.update.mutationOptions(), {
 *     key: (input) => trpc.post.byId.key({ id: input.id }),
 *     apply: (post, input) => ({ ...post, title: input.title }),
 *   }),
 * );
 *
 * const { mutate: deletePost } = useMutation(
 *   optimistic({ ...trpc.post.delete.mutationOptions(), onError: () => toast.add({ title: "Not deleted" }) }, {
 *     key: () => trpc.post.list.key(),
 *     apply: (posts, input) => posts.filter((post) => post.id !== input.id),
 *   }),
 * );
 * ```
 */
export function optimistic<TVars, TResult, TData, TError = Error>(
  mutationOptions: {
    mutation: (vars: TVars) => Promise<TResult>;
    onError?: (error: TError, vars: TVars, context: unknown) => unknown;
  },
  update: OptimisticUpdate<TVars, TData>,
) {
  const queryCache = useQueryCache();

  return {
    ...mutationOptions,
    onMutate(vars: TVars) {
      const key = update.key(vars);
      queryCache.cancelQueries({ key, exact: true });
      const previous = queryCache.getQueryData(key);

      if (previous === undefined) return { rollback: () => {} };

      queryCache.setQueryData(key, update.apply(previous, vars));
      return { rollback: () => queryCache.setQueryData(key, previous) };
    },
    onError(error: TError, vars: TVars, context: { rollback?: () => void }) {
      context.rollback?.();
      return mutationOptions.onError?.(error, vars, context);
    },
    onSettled(_data: TResult | undefined, _error: unknown, vars: TVars) {
      return queryCache.invalidateQueries({
        key: update.key(vars),
        exact: true,
      });
    },
  };
}
