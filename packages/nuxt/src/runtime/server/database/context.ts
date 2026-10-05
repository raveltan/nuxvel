import { AsyncLocalStorage } from "node:async_hooks";
import type { NuxvelTx } from "./client";

export const transactionContext: AsyncLocalStorage<NuxvelTx> = new AsyncLocalStorage();
export type CommitHook = () => void | Promise<void>;

export const commitHooksContext = new AsyncLocalStorage<CommitHook[]>();
export const preCommitHooksContext = new AsyncLocalStorage<CommitHook[]>();
export const rollbackHooksContext = new AsyncLocalStorage<CommitHook[]>();
