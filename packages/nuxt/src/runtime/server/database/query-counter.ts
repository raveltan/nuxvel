import { AsyncLocalStorage } from "node:async_hooks";
import { countRepeatedQuery } from "./repeated-queries-log";

const queryCountContext = new AsyncLocalStorage<{ sql: string[] }>();

export const queryCountLogger = {
  logQuery(sql: string) {
    const store = queryCountContext.getStore();
    store?.sql.push(sql);
    if (!import.meta.dev) countRepeatedQuery(sql);
  },
};

/**
 * Runs `fn` and returns the SQL of every query it issued, in order.
 *
 * Backs {@link captureQueries} of the test helpers.
 */
export async function captureSqlQueries(fn: () => Promise<unknown>) {
  const store: { sql: string[] } = { sql: [] };

  await queryCountContext.run(store, fn);

  return store.sql;
}

/**
 * Runs `fn` and returns how many SQL queries it issued.
 *
 * Backs {@link expectConstantQueries} for N+1 assertions.
 */
export async function countQueries(fn: () => Promise<unknown>) {
  return (await captureSqlQueries(fn)).length;
}
