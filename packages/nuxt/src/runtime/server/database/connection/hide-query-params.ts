import { DrizzleQueryError } from "drizzle-orm";
import { PgPreparedQuery } from "drizzle-orm/pg-core";

type QueryWithCache = (...args: unknown[]) => Promise<unknown>;

function withoutParams(error: DrizzleQueryError) {
  const message = `Failed query: ${error.query}`;

  error.stack = error.stack?.replace(error.message, () => message);
  error.message = message;
  error.params = [];
}

export function hideQueryParams() {
  // drizzle-orm writes every bound parameter into DrizzleQueryError's message in queryWithCache, which its types mark @internal
  const prepared = PgPreparedQuery.prototype as unknown as { queryWithCache: QueryWithCache };
  const queryWithCache = prepared.queryWithCache;

  prepared.queryWithCache = async function (this: unknown, ...args: unknown[]) {
    try {
      return await queryWithCache.apply(this, args);
    } catch (error) {
      if (error instanceof DrizzleQueryError) withoutParams(error);
      throw error;
    }
  };
}
