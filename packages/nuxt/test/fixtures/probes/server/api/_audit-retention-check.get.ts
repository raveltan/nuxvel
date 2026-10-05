import { gunzipSync } from "node:zlib";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { auditLogTable } from "~~/server/database/schema/audit-log.schema";

function monthsAgo(months: number) {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 15));
}

async function exportedRows(partition: string) {
  const object = await useS3().send(
    new GetObjectCommand({ Bucket: useBucket(), Key: `backups/audit/${partition}.jsonl.gz` }),
  );
  const body = Buffer.from((await object.Body?.transformToByteArray()) ?? []);

  return gunzipSync(body)
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

export default defineEventHandler(async () => {
  const old = monthsAgo(30);
  const recent = monthsAgo(2);

  await maintainAuditPartitions({ now: recent });
  await maintainAuditPartitions({ now: old });

  await useDb()
    .insert(auditLogTable)
    .values(
      [old, recent].map((occurredAt) => ({
        occurredAt,
        actorType: "system",
        actorId: "_audit-retention-check",
        action: "probe.retained",
        targetType: "probe",
        targetId: occurredAt.toISOString(),
        hash: "unchained",
      })),
    );

  const run = await maintainAuditPartitions();

  const partitions = await useDb().execute<{ name: string }>(sql`
    select child.relname as name
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    where parent.relname = 'audit_log'
  `);
  const rows = await useDb()
    .select({ targetId: auditLogTable.targetId })
    .from(auditLogTable)
    .where(eq(auditLogTable.actorId, "_audit-retention-check"));
  const oldPartition = `audit_log_y${old.toISOString().slice(0, 4)}m${old.toISOString().slice(5, 7)}`;

  return {
    old: old.toISOString(),
    recent: recent.toISOString(),
    dropped: run.dropped,
    partitions: partitions.map((row) => row.name),
    rows: rows.map((row) => row.targetId),
    exported: (await exportedRows(oldPartition)).map((row) => row.target_id),
  };
});
