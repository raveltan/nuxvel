import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import type { NuxvelTx } from "./client";
import { rootPool } from "./connection/pool";
import { runTransaction } from "./connection/run-transaction";
import {
  type CommitHook,
  commitHooksContext,
  preCommitHooksContext,
  rollbackHooksContext,
  transactionContext,
} from "./context";

/**
 * Runs `fn` in a database transaction. Every {@link useDb} call inside it
 * joins that transaction automatically, and so does the `tx` handed to
 * `fn`.
 *
 * Nesting is safe: an inner call reuses the outer transaction via a
 * savepoint, and {@link onCommit} hooks registered inside it only fire
 * once the outermost transaction commits. `useDb().transaction(fn)` is
 * this same function.
 *
 * Actions are already transactional, so call this only for work outside
 * an action.
 *
 * @param config Isolation level, access mode and deferrability of the
 * outermost transaction; a nested call ignores it, as Drizzle does.
 *
 * @example
 * ```ts
 * await transaction(async () => {
 *   await useDb().insert(postsTable).values(post);
 *   await useDb().insert(tagsTable).values(tag);
 * });
 * ```
 */
export function transaction<T>(
  fn: (tx: NuxvelTx) => Promise<T>,
  config?: PgTransactionConfig,
): Promise<T> {
  return runTransaction(transactionContext.getStore() ?? rootPool(), fn, config);
}

/**
 * Defers `fn` until the surrounding transaction commits. Runs it
 * immediately when there is no transaction in scope.
 *
 * Use it for side effects that must not fire on a rollback — a cache
 * purge, a call to another service. For queued work prefer
 * {@link Job.dispatch}, and for a channel event
 * {@link Channel.broadcast}, which both wait for the commit already. Inside a transaction the
 * returned promise settles at once and {@link transaction} awaits `fn`
 * after the commit, before it returns; outside one it settles when `fn`
 * has run, so `await onCommit(fn)` waits for it either way it matters.
 *
 * A hook that throws after the commit never fails the transaction: the
 * error is logged and reported to error tracking, and the next hook
 * still runs. Outside a transaction the returned promise rejects with it.
 *
 * @example
 * ```ts
 * await onCommit(() => cacheForget("posts:list"));
 * ```
 */
export async function onCommit(fn: CommitHook): Promise<void> {
  const hooks = commitHooksContext.getStore();

  if (hooks) hooks.push(fn);
  else await fn();
}

/**
 * Defers `fn` until the surrounding transaction is about to commit, and
 * runs it inside that transaction. Runs it immediately when there is no
 * transaction in scope, and the returned promise then settles when `fn`
 * has run.
 *
 * Use it for a write that must be atomic with the transaction but can
 * only be composed once its body is done — the outbox row
 * {@link Job.dispatch} writes is the one in the framework. A throw
 * rolls the transaction back. For side effects that must happen only
 * after the commit, use {@link onCommit}.
 */
export async function beforeCommit(fn: CommitHook): Promise<void> {
  const hooks = preCommitHooksContext.getStore();

  if (hooks) hooks.push(fn);
  else await fn();
}

export function onRollback(fn: CommitHook): void {
  rollbackHooksContext.getStore()?.push(fn);
}
