import type { PgTransactionConfig } from "drizzle-orm/pg-core";
import { reportError } from "../../error-tracking/sentry";
import { useLogger } from "../../logging/logger";
import { currentRequestId } from "../../trpc/context";
import type { NuxvelTx } from "../client";
import {
  type CommitHook,
  commitHooksContext,
  preCommitHooksContext,
  rollbackHooksContext,
  transactionContext,
} from "../context";
import { wrapDb } from "./pool";

type TransactionRunner = {
  transaction<T>(fn: (tx: NuxvelTx) => Promise<T>, config?: PgTransactionConfig): Promise<T>;
};

export async function runTransaction<T>(
  runner: TransactionRunner,
  fn: (tx: NuxvelTx) => Promise<T>,
  config?: PgTransactionConfig,
): Promise<T> {
  const nested = runner === transactionContext.getStore();
  const parentHooks = nested ? commitHooksContext.getStore() : undefined;
  const parentRollbackHooks = nested ? rollbackHooksContext.getStore() : undefined;
  const hooks: CommitHook[] = [];
  const preHooks: CommitHook[] = [];
  const rollbackHooks: CommitHook[] = [];

  const result = await runner
    .transaction(
      (tx) =>
        transactionContext.run(tx, () =>
          commitHooksContext.run(hooks, () =>
            preCommitHooksContext.run(preHooks, () =>
              rollbackHooksContext.run(rollbackHooks, async () => {
                const value = await fn(wrapDb(tx));

                for (const hook of preHooks) await hook();

                return value;
              }),
            ),
          ),
        ),
      config,
    )
    .catch(async (error: unknown) => {
      await runHooks(rollbackHooks, "an onRollback hook failed after the rollback");
      throw error;
    });

  if (parentHooks) parentHooks.push(...hooks);
  else await runHooks(hooks, "an onCommit hook failed after the commit");

  parentRollbackHooks?.push(...rollbackHooks);

  return result;
}

async function runHooks(hooks: CommitHook[], failure: string) {
  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      useLogger("db").error(failure, error);
      reportError(error, { requestId: currentRequestId() });
    }
  }
}
