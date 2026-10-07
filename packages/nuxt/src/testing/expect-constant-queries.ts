import { captureQueries } from "./query-count";

function extraQueries(sql: string[], baseline: string[]) {
  const counts = new Map<string, number>();

  for (const query of sql) counts.set(query, (counts.get(query) ?? 0) + 1);
  for (const query of baseline) counts.set(query, (counts.get(query) ?? 0) - 1);

  return [...counts]
    .filter(([, extra]) => extra > 0)
    .map(([query, extra]) => `  ${extra}x ${query}`)
    .join("\n");
}

/**
 * Asserts `fn` makes the app run the same number of queries at every
 * input size — the N+1 guard — and returns that count. On failure, it
 * lists the queries that the size with the most queries ran more often than the size with the fewest queries.
 *
 * Every size runs on the same database, so the rows and the backfill
 * progress of the earlier sizes stay.
 *
 * Counts the queries the app runs to serve the {@link actingAs},
 * {@link guest} and {@link runJob} calls `fn` makes (the `actingAs`
 * user lookup included), not what factories insert, so `fn` can build
 * `size` rows before it calls the app.
 *
 * @param fn Builds data for a given input size and calls the app.
 * @param sizes Input sizes to compare. Defaults to `[1, 4]`.
 *
 * @example
 * ```ts
 * await expectConstantQueries(async (size) => {
 *   await userFactory.has(size, (user) => postFactory.for("authorId", user))();
 *   await guest().api.post.list();
 * });
 * ```
 */
export async function expectConstantQueries(
  fn: (size: number) => Promise<unknown>,
  sizes: number[] = [1, 4],
) {
  const runs: Array<{ size: number; sql: string[] }> = [];

  for (const size of sizes) {
    runs.push({ size, sql: await captureQueries(() => fn(size)) });
  }

  const [first] = runs;
  if (!first) throw new Error("expectConstantQueries: needs at least one size");

  if (runs.some(({ sql }) => sql.length !== first.sql.length)) {
    const detail = runs.map(({ size, sql }) => `size ${size}: ${sql.length} queries`).join(", ");
    const largest = runs.reduce((biggest, run) => (run.sql.length > biggest.sql.length ? run : biggest));
    const smallest = runs.reduce((fewest, run) => (run.sql.length < fewest.sql.length ? run : fewest));

    throw new Error(
      `expectConstantQueries: query count varies with input size (${detail})\nQueries only at size ${largest.size}:\n${extraQueries(largest.sql, smallest.sql)}`,
    );
  }

  return first.sql.length;
}
