import type { Backfill } from "../runtime/server/backfills/define-backfill";
import type { BackfillName } from "../runtime/server/backfills/registry";
import { callApp } from "./settled";

/**
 * Runs a {@link defineBackfill} backfill to completion in
 * the app under test, the test-side counterpart of the server's
 * `runBackfill`.
 *
 * Rejects with the handler's error when a batch throws, after that batch
 * rolled back.
 *
 * @param backfill A {@link BackfillName}, or the backfill's definition or
 * its stub from `#nuxvel/test-namespaces`; a name no backfill defines
 * fails to compile.
 *
 * @example
 * ```ts
 * await runBackfill("posts-content");
 * await runBackfill($backfills.postsContent);
 * await expectRow(backfillsTable, { name: "posts-content" });
 * ```
 */
export async function runBackfill(backfill: BackfillName | Backfill): Promise<void> {
  await callApp("run-backfill", { name: typeof backfill === "string" ? backfill : backfill.name });
}
