import type { drizzle } from "drizzle-orm/postgres-js";
import type * as schema from "#nuxvel/schema";
import { rootPool, wrapDb } from "./connection/pool";
import { transactionContext } from "./context";

/** The app's Drizzle client type, as {@link useDb} returns it outside a transaction. */
export type NuxvelDb = ReturnType<typeof drizzle<typeof schema>>;
/** A Drizzle transaction handle, as passed to a {@link transaction} callback. */
export type NuxvelTx = Parameters<Parameters<NuxvelDb["transaction"]>[0]>[0];

/**
 * The app's Drizzle client, typed against the discovered schema.
 *
 * Auto-imported on the server. Returns the transaction in scope when one
 * is active, so code inside an action or a {@link transaction} callback
 * automatically joins it. Its `.transaction(fn)` is {@link transaction}:
 * a nested call becomes a savepoint and {@link onCommit} hooks wait for
 * the outermost commit. A unique-constraint violation that escapes an
 * action, a tRPC procedure or a server route surfaces as
 * {@link ConflictError}.
 *
 * Connects to `NUXT_DATABASE_URL` on first use, and throws when it is not
 * set. Postgres stops a statement after 15 seconds and closes a connection
 * that stays idle in a transaction for 30 seconds. A value in the URL
 * query wins.
 *
 * @param opts.root Bypass the ambient transaction and use the pool
 * directly. Needed only for work that must be durable even if the
 * surrounding transaction rolls back.
 *
 * @example
 * ```ts
 * const rows = await useDb().select().from(postsTable);
 * ```
 */
export function useDb(opts?: { root?: boolean }): NuxvelDb | NuxvelTx {
  if (opts?.root) return wrapDb(rootPool());

  return wrapDb(transactionContext.getStore() ?? rootPool());
}
