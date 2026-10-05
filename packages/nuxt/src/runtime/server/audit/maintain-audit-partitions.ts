import { useDb } from "../database/client";
import { useNuxvelConfig } from "../utils/config";
import { now } from "../clock/now";
import { useBucket } from "../storage/bucket";
import { useS3 } from "../storage/client";
import { archiveTo } from "./audit-export";
import { maintainPartitions } from "./audit-partitions";

/**
 * Creates the `audit_log` partitions for the current month and the next
 * three, and drops every monthly partition outside the last
 * `retentionMonths` months, counting the current one.
 *
 * Auto-imported on the server. It needs DDL rights, so it runs as the
 * owner role: the built `.output/server/nuxvel/maintenance.mjs` entry
 * does this work daily, and the runtime role of the server and the
 * worker cannot. Call it yourself only from code that connects as the
 * owner, such as a test, and never inside a transaction: a partition is
 * detached concurrently before it is dropped, so audit writes don't wait
 * on it. Without a retention, nothing is dropped; a retention that is
 * not a whole number of at least 1 throws. Before it drops a partition,
 * it writes the partition's rows as gzipped JSON lines to
 * `backups/audit/<partition>.jsonl.gz` in {@link useBucket}; when that
 * upload fails, it throws and drops nothing. Dropping a partition
 * deletes its rows from the database, and {@link verifyAuditChain} then
 * starts the chain at the oldest row left.
 *
 * @param opts.now The date to count months from. Defaults to now.
 * @param opts.retentionMonths Whole months of audit rows to keep,
 * counting the current one. Defaults to `nuxvel.audit.retentionMonths`.
 *
 * @example
 * ```ts
 * const { created, dropped } = await maintainAuditPartitions({ retentionMonths: 24 });
 * ```
 */
export async function maintainAuditPartitions(
  opts: { now?: Date; retentionMonths?: number } = {},
): Promise<{ created: string[]; dropped: string[] }> {
  return maintainPartitions(
    useDb(),
    opts.now ?? now(),
    opts.retentionMonths ?? useNuxvelConfig().audit?.retentionMonths,
    archiveTo(useS3, useBucket),
  );
}
