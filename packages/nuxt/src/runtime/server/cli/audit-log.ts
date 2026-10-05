import { setTimeout as sleep } from "node:timers/promises";
import { type InferSelectModel, and, asc, gt, gte, lt, max } from "drizzle-orm";
import { type AuditReader, withAuditReader } from "../audit/audit-reader";
import { type SchemaTable, schemaTable } from "../database/schema-table";
import { csvSafe } from "../security/csv-safe";
import { commandReport } from "./command-error";

type AuditRow = InferSelectModel<SchemaTable<"audit_log">>;

const CSV_COLUMNS = [
  "id",
  "occurredAt",
  "actorType",
  "actorId",
  "action",
  "targetType",
  "targetId",
  "changes",
  "metadata",
  "requestId",
  "prevHash",
  "hash",
] as const satisfies readonly (keyof AuditRow)[];

const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 500;

function formatRow(row: AuditRow) {
  const changes = row.changes === null ? "" : `  ${JSON.stringify(row.changes)}`;

  return `${row.occurredAt.toISOString()}  #${row.id}  ${row.actorType}:${row.actorId}  ${row.action}  ${row.targetType}:${row.targetId}${changes}`;
}

function rowsAfter(db: AuditReader, id: number, range: { from?: string; to?: string } = {}) {
  const auditLog = schemaTable("audit_log");

  return db
    .select()
    .from(auditLog)
    .where(
      and(
        gt(auditLog.id, id),
        range.from === undefined ? undefined : gte(auditLog.occurredAt, new Date(range.from)),
        range.to === undefined ? undefined : lt(auditLog.occurredAt, new Date(range.to)),
      ),
    )
    .orderBy(asc(auditLog.id))
    .limit(BATCH_SIZE);
}

export function runAuditTail(): Promise<never> {
  return withAuditReader(async (db) => {
    const auditLog = schemaTable("audit_log");
    const [latest] = await db.select({ id: max(auditLog.id) }).from(auditLog);
    let lastId = latest?.id ?? 0;

    commandReport(`Tailing audit_log after row ${lastId}, Ctrl-C to stop`);

    while (true) {
      for (const row of await rowsAfter(db, lastId)) {
        console.log(formatRow(row));
        lastId = row.id;
      }

      await sleep(POLL_INTERVAL_MS);
    }
  });
}

export function runAuditExport(range: { from?: string; to?: string }, format: "csv" | "jsonl"): Promise<number> {
  return withAuditReader(async (db) => {
    let lastId = 0;

    if (format === "csv") console.log(CSV_COLUMNS.join(","));

    while (true) {
      const rows = await rowsAfter(db, lastId, range);

      for (const row of rows) {
        console.log(format === "csv" ? CSV_COLUMNS.map((column) => csvSafe(row[column])).join(",") : JSON.stringify(row));
        lastId = row.id;
      }

      if (rows.length < BATCH_SIZE) return 0;
    }
  });
}
