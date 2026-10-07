import { envHint } from "../shared/env/env-hints";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
import type { ArchivePartition } from "../server/audit/audit-export";
import { maintainPartitions } from "../server/audit/audit-partitions";
import { ownerConnection } from "./owner-connection";
import { restrictAuditReads } from "./restrict-audit-reads";

const archiveToStorage: ArchivePartition = async (partition, gzippedJsonl) => {
  // imported on the first drop only, so the CLI, which imports this module, does not load the S3 client on every command
  const [{ archiveTo }, { storageClient }] = await Promise.all([
    import("../server/audit/audit-export"),
    import("../server/storage/storage-client"),
  ]);
  const archive = archiveTo(
    () => storageClient(process.env.NUXT_STORAGE_URL),
    () => {
      if (!process.env.NUXT_STORAGE_BUCKET) throw new Error(`NUXT_STORAGE_BUCKET is not set. ${envHint("NUXT_STORAGE_BUCKET")}`);

      return process.env.NUXT_STORAGE_BUCKET;
    },
  );

  await archive(partition, gzippedJsonl);
};

/**
 * Creates the missing `audit_log` partitions for the current month and
 * the next three, and, with a retention, archives and drops the expired
 * ones, over a connection that has DDL rights.
 *
 * Then it applies {@link restrictAuditReads} for the role of
 * `NUXT_DATABASE_URL`, so a new partition is not readable by it.
 *
 * Returns `undefined` when the database has no `audit_log` table yet.
 *
 * @internal The one partition maintenance path of the built
 * `maintenance.mjs` entry, `nuxvel db:migrate` and `nuxvel dev`.
 */
export async function maintainAuditLog(
  sql: Sql,
  retentionMonths: number | undefined,
): Promise<{ created: string[]; dropped: string[] } | undefined> {
  const [auditLog] = await sql<{ exists: boolean }[]>`select to_regclass('audit_log') is not null as exists`;

  if (!auditLog?.exists) return undefined;

  const result = await maintainPartitions(drizzle(sql), new Date(), retentionMonths, archiveToStorage);

  await restrictAuditReads(sql, process.env.NUXT_DATABASE_URL);

  return result;
}

export async function runMaintenance({ retentionMonths }: { retentionMonths?: number }) {
  const sql = ownerConnection("maintenance");

  try {
    const { created, dropped } = (await maintainAuditLog(sql, retentionMonths)) ?? { created: [], dropped: [] };
    console.log(`nuxvel maintenance: audit partitions created ${created.length}, dropped ${dropped.length}`);
    for (const name of created) console.log(`  created ${name}`);
    for (const name of dropped) console.log(`  dropped ${name}`);
  } catch (error) {
    console.error("nuxvel maintenance: could not maintain the audit partitions");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
