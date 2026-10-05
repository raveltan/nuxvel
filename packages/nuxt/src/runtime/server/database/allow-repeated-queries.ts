import { AsyncLocalStorage } from "node:async_hooks";

export const REPEATED_QUERY_THRESHOLD = 5;

const allowedRepeats = new AsyncLocalStorage<string>();

/**
 * Runs `fn` with the dev N+1 warning turned off for the queries it
 * issues, and returns what `fn` returns.
 *
 * Auto-imported on the server. In development nuxvel warns when one
 * request or job runs the same statement 5 times or more; wrap code
 * that repeats a query on purpose, and say why. The reason shows next
 * to those queries in the DevTools SQL panel. A production server
 * logs no `n_plus_one_suspected` line for them either.
 *
 * @param reason Why the repetition is intended, for the next reader.
 *
 * @example
 * ```ts
 * await allowRepeatedQueries("each row calls a different external API", () => importRows(rows));
 * ```
 */
export function allowRepeatedQueries<T>(reason: string, fn: () => Promise<T>): Promise<T> {
  return allowedRepeats.run(reason, fn);
}

export function repeatedQueriesReason() {
  return allowedRepeats.getStore();
}
