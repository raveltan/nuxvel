import { sql } from "drizzle-orm";
import { factoryDatabase } from "./factory-database";

async function nextNumber() {
  const [row] = await factoryDatabase({ root: true }).execute<{ n: string }>(sql`select txid_current() as n`);

  if (!row) throw new Error("sequence: txid_current() returned no row");

  return Number(row.n);
}

/**
 * A factory value built from a number that no other row, test file,
 * worker or run gets, for a unique column whose value means something.
 * Give `fn` a second parameter to read the row being built, as a
 * derived field of {@link defineFactory} does.
 *
 * The number is a new Postgres transaction id, read on a connection
 * outside any transaction. It grows with every row, but it skips values.
 * Two sequences never give the same number on the same Postgres server,
 * even when nothing resets the database between test files or seeder
 * runs.
 *
 * @example
 * ```ts
 * defineFactory(userTable, {
 *   name: () => faker.person.fullName(),
 *   email: sequence((n, user) => `${user.name.toLowerCase().replace(/[^a-z]+/g, ".")}${n}@example.com`),
 * });
 * ```
 */
export function sequence<Value, Row = unknown>(fn: (n: number, row: Row) => Value): (row: Row) => Promise<Value> {
  if (fn.length > 1) return async (row) => fn(await nextNumber(), row);

  // a zero-parameter value runs before the derived fields; fn declares no row parameter, so it never reads one
  return async () => fn(await nextNumber(), undefined as Row);
}
