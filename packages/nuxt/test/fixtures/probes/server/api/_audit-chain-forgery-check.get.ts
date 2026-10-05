import { createHash } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { auditContent } from "../../../../../src/runtime/server/audit/chain/hash";
import { auditLogTable } from "~~/server/database/schema/audit-log.schema";

const writeTwo = probeNamed("_audit-chain-forgery-check.writeTwo", defineAction({
  input: z.object({}),
  handler: async () => {
    await audit("post.created", { id: 1 });
    await audit("post.published", { id: 1 });
  },
}));

async function failure(statement: SQL) {
  try {
    await useDb().execute(statement);
    return undefined;
  } catch (error) {
    return error instanceof Error ? String(error.cause ?? error.message) : String(error);
  }
}

export default defineEventHandler(async () => {
  await writeTwo({}, { actor: systemActor("_audit-chain-forgery-check") });

  const rows = await useDb().select().from(auditLogTable).orderBy(auditLogTable.id);
  const [first, last] = rows;
  if (!first || !last) throw new Error("expected two audit rows");
  const [located] = await useDb().execute<{ partition: string }>(
    sql`select tableoid::regclass::text as partition from audit_log where id = ${last.id}`,
  );
  if (!located) throw new Error("expected the row's partition");

  const intact = await verifyAuditChain();
  const updateError = await failure(sql`update audit_log set action = 'post.deleted' where id = ${last.id}`);
  const deleteError = await failure(sql`delete from audit_log where id = ${last.id}`);
  const partitionUpdateError = await failure(
    sql`update ${sql.identifier(located.partition)} set action = 'post.deleted' where id = ${last.id}`,
  );

  const authSecret = process.env.NUXT_AUTH_SECRET;
  let afterAuthRotation;
  try {
    process.env.NUXT_AUTH_SECRET = "a-rotated-auth-secret-of-at-least-32-characters";
    afterAuthRotation = await verifyAuditChain();
  } finally {
    process.env.NUXT_AUTH_SECRET = authSecret;
  }

  await transaction(async (tx) => {
    // the superuser test role is the only one that can switch the append-only trigger off
    await tx.execute(sql`set local session_replication_role = replica`);
    let prevHash: string | null = null;
    for (const row of rows) {
      const content = row.id === first.id ? { ...row, action: "post.deleted" } : row;
      const hash: string = createHash("sha256").update(auditContent(content, prevHash)).digest("hex");
      await tx.execute(sql`update audit_log set action = ${content.action}, prev_hash = ${prevHash}, hash = ${hash} where id = ${row.id}`);
      prevHash = hash;
    }
  });

  return { ids: [first.id, last.id], intact, updateError, deleteError, partitionUpdateError, afterAuthRotation, forged: await verifyAuditChain() };
});

