import { promisify } from "node:util";
import { gzip } from "node:zlib";
import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { ArchivePartition } from "./audit-export";

type PartitionDb = Pick<PostgresJsDatabase, "execute">;

const PARTITION_NAME = /^audit_log_y(\d{4})m(\d{2})$/;
const MONTHS_AHEAD = 3;
const EXPORT_BATCH = 1000;
const compress = promisify(gzip);

function monthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1));
}

function partitionName(start: Date) {
  const month = String(start.getUTCMonth() + 1).padStart(2, "0");

  return `audit_log_y${start.getUTCFullYear()}m${month}`;
}

async function existingPartitions(db: PartitionDb) {
  const rows = await db.execute<{ name: string }>(sql`
    select child.relname as name
    from pg_inherits
    join pg_class parent on parent.oid = pg_inherits.inhparent
    join pg_class child on child.oid = pg_inherits.inhrelid
    where parent.relname = 'audit_log'
  `);

  return rows.map((row) => row.name);
}

async function partitionAsJsonl(db: PartitionDb, name: string) {
  const lines: string[] = [];
  let lastId = 0;

  while (true) {
    const rows = await db.execute<{ id: number; line: string }>(
      sql`select id, row_to_json(entry)::text as line from ${sql.identifier(name)} as entry where id > ${lastId} order by id limit ${EXPORT_BATCH}`,
    );

    for (const row of rows) lines.push(`${row.line}\n`);

    const last = rows.at(-1);

    if (!last || rows.length < EXPORT_BATCH) return compress(lines.join(""));

    lastId = last.id;
  }
}

export async function maintainPartitions(
  db: PartitionDb,
  at: Date,
  retentionMonths: number | undefined,
  archive: ArchivePartition,
): Promise<{ created: string[]; dropped: string[] }> {
  const existing = new Set(await existingPartitions(db));
  const created: string[] = [];
  const dropped: string[] = [];

  for (let offset = 0; offset <= MONTHS_AHEAD; offset += 1) {
    const start = monthStart(at.getUTCFullYear(), at.getUTCMonth() + offset);
    const end = monthStart(start.getUTCFullYear(), start.getUTCMonth() + 1);
    const name = partitionName(start);

    if (existing.has(name)) continue;

    await db.execute(
      sql.raw(
        `create table if not exists "${name}" partition of "audit_log" for values from ('${start.toISOString()}') to ('${end.toISOString()}')`,
      ),
    );
    created.push(name);
  }

  if (retentionMonths === undefined) return { created, dropped };

  if (!Number.isInteger(retentionMonths) || retentionMonths < 1) {
    throw new Error(`audit retentionMonths must be a whole number of at least 1, got ${retentionMonths}`);
  }

  const cutoff = monthStart(at.getUTCFullYear(), at.getUTCMonth() - retentionMonths + 1);

  for (const name of existing) {
    const match = PARTITION_NAME.exec(name);

    if (!match) continue;

    const end = monthStart(Number(match[1]), Number(match[2]));

    if (end > cutoff) continue;

    await archive(name, await partitionAsJsonl(db, name));
    await db.execute(sql`alter table "audit_log" detach partition ${sql.identifier(name)} concurrently`);
    await db.execute(sql`drop table ${sql.identifier(name)}`);
    dropped.push(name);
  }

  return { created, dropped };
}
