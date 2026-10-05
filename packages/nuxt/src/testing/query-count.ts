import { AsyncLocalStorage } from "node:async_hooks";

const counting = new AsyncLocalStorage<{ sql: string[] }>();

export function recordAppQueries(sql: string[]) {
  counting.getStore()?.sql.push(...sql);
}

/**
 * Runs `fn` and returns the SQL of every query the app ran for the {@link actingAs}, {@link guest} and {@link runJob} calls in it, in order.
 *
 * Counts what {@link expectQueryCount} counts. Queries that factories insert are not in the list.
 *
 * @example
 * ```ts
 * const sql = await captureQueries(() => guest().trpc.post.list());
 * expect(sql).toHaveLength(1);
 * ```
 */
export async function captureQueries(fn: () => Promise<unknown>): Promise<string[]> {
  const store: { sql: string[] } = { sql: [] };

  await counting.run(store, fn);

  return store.sql;
}
