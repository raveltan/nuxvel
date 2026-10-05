import { and, asc, gt, isNotNull } from "drizzle-orm";
import { schemaTable } from "../database/schema-table";
import { type AuditReader, withAuditReader } from "./audit-reader";
import { auditHash, auditRowMac } from "./chain/hash";

async function firstChainBreak(db: AuditReader) {
  const auditLog = schemaTable("audit_log");
  let checked = 0;
  let lastId = 0;
  let expectedPrevHash: string | null | undefined;

  while (true) {
    const rows = await db
      .select()
      .from(auditLog)
      .where(gt(auditLog.id, lastId))
      .orderBy(asc(auditLog.id))
      .limit(BATCH_SIZE);

    for (const row of rows) {
      if (auditHash(row, row.prevHash) !== row.hash) {
        return { checked, firstBreak: { id: row.id, reason: "modified" } as const };
      }

      if (expectedPrevHash !== undefined && row.prevHash !== expectedPrevHash) {
        return { checked, firstBreak: { id: row.id, reason: "unlinked" } as const };
      }

      checked += 1;
      lastId = row.id;
      expectedPrevHash = row.hash;
    }

    if (rows.length < BATCH_SIZE) return { checked, firstBreak: undefined };
  }
}

async function firstBadSubject(db: AuditReader) {
  const auditSubjects = schemaTable("audit_subjects");
  let lastId = "";

  while (true) {
    const rows = await db
      .select()
      .from(auditSubjects)
      .where(and(gt(auditSubjects.id, lastId), isNotNull(auditSubjects.mac)))
      .orderBy(asc(auditSubjects.id))
      .limit(BATCH_SIZE);

    for (const row of rows) {
      if (auditRowMac(["audit_subjects", row.id, row.userId, row.displayName]) !== row.mac) return row.id;
      lastId = row.id;
    }

    if (rows.length < BATCH_SIZE) return undefined;
  }
}

async function firstBadContext(db: AuditReader) {
  const auditContext = schemaTable("audit_context");
  let lastId = 0;

  while (true) {
    const rows = await db
      .select()
      .from(auditContext)
      .where(and(gt(auditContext.entryId, lastId), isNotNull(auditContext.mac)))
      .orderBy(asc(auditContext.entryId))
      .limit(BATCH_SIZE);

    for (const row of rows) {
      if (auditRowMac(["audit_context", row.entryId, row.ip, row.userAgent]) !== row.mac) return row.entryId;
      lastId = row.entryId;
    }

    if (rows.length < BATCH_SIZE) return undefined;
  }
}

/**
 * Where {@link verifyAuditChain} found the audit log changed.
 * `modified`: the row's content no longer matches its hash. `unlinked`:
 * the row does not point at the row before it, so a row in between was
 * removed or rewritten. `subject-modified`: the `audit_subjects` row with
 * this ID no longer matches its MAC. `context-modified`: the
 * `audit_context` row of this `audit_log` row ID no longer matches its MAC.
 */
export type AuditChainBreak =
  | { id: number; reason: "modified" | "unlinked" | "context-modified" }
  | { id: string; reason: "subject-modified" };

const BATCH_SIZE = 1000;

/**
 * Walks the whole `audit_log` in insertion order, recomputing each row's
 * hash with `NUXT_AUDIT_CHAIN_SECRET`, and returns the first row where the
 * chain breaks. When the chain is intact, it also checks the MAC of each
 * `audit_subjects` and `audit_context` row. Rows without a MAC, written
 * before the contract migration `audit-row-macs`, are not checked. A
 * different secret than the one that wrote the rows reports the oldest
 * row as `modified`.
 *
 * Auto-imported on the server; `nuxvel audit:verify` runs it. The chain
 * starts at the oldest row left, so rows dropped by retention (see
 * {@link maintainAuditPartitions}) don't break it. Rows can only be deleted
 * by hand by the owner role, after it disables the append-only trigger.
 * When `NUXT_DATABASE_OWNER_URL` is set to another URL than
 * `NUXT_DATABASE_URL`, it reads over its own connection as the owner
 * role, because the runtime role cannot read the audit log, and so does
 * not see the rows of a transaction that is still open.
 *
 * @example
 * ```ts
 * const { checked, firstBreak } = await verifyAuditChain();
 * if (firstBreak) console.error(`audit row ${firstBreak.id} was ${firstBreak.reason}`);
 * ```
 */
export async function verifyAuditChain(): Promise<{
  checked: number;
  firstBreak: AuditChainBreak | undefined;
}> {
  return withAuditReader(async (db) => {
    const chain = await firstChainBreak(db);

    if (chain.firstBreak) return chain;

    const subjectId = await firstBadSubject(db);

    if (subjectId !== undefined) {
      return { checked: chain.checked, firstBreak: { id: subjectId, reason: "subject-modified" } };
    }

    const entryId = await firstBadContext(db);

    return {
      checked: chain.checked,
      firstBreak: entryId === undefined ? undefined : { id: entryId, reason: "context-modified" },
    };
  });
}
