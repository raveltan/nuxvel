import { captureQueries } from "./query-count";

/**
 * Asserts `fn` makes the app run at most `max` queries, and returns the
 * count. Over the budget, it throws and lists the queries in order.
 *
 * Counts what {@link expectConstantQueries} counts: the queries the app
 * runs for the {@link actingAs}, {@link guest} and {@link runJob} calls
 * in `fn`, not what factories insert. Use it for a fixed budget on one
 * call; use {@link expectConstantQueries} to prove the count does not
 * grow with the data.
 *
 * @param budget.max The most queries `fn` may make the app run.
 *
 * @example
 * ```ts
 * await expectQueryCount({ max: 2 }, () => guest().api.post.list());
 * ```
 */
export async function expectQueryCount(budget: { max: number }, fn: () => Promise<unknown>) {
  const sql = await captureQueries(fn);

  if (sql.length > budget.max) {
    const listed = sql.map((query, index) => `  ${index + 1}. ${query}`).join("\n");

    throw new Error(`expectQueryCount: the app ran ${sql.length} queries, over the budget of ${budget.max}\n${listed}`);
  }

  return sql.length;
}
