import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogTable } from "~~/server/database/schema/audit-log.schema";

const writeFour = probeNamed("_audit-chain-check.writeFour", defineAction({
  input: z.object({}),
  handler: async () => {
    await audit("post.drafted", { id: 1 });
    await audit("post.created", { id: 1 });
    await audit(
      "post.updated",
      { id: 1 },
      {
        changes: { title: { to: "New", from: "Old" }, body: { from: "a", to: "b" } },
        metadata: { at: new Date("2026-01-02T03:04:05.678Z"), tags: ["b", "a"] },
      },
    );
    await audit("post.published", { id: 1 }, { metadata: { source: "editor" } });
  },
}));

function tamper(statement: SQL) {
  return transaction(async (tx) => {
    // the superuser test role is the only one that can switch the append-only trigger off
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.execute(statement);
  });
}

export default defineEventHandler(async () => {
  await writeFour({}, { actor: systemActor("_audit-chain-check") });

  const ids = (await useDb().select({ id: auditLogTable.id }).from(auditLogTable).orderBy(auditLogTable.id)).map(
    (row) => row.id,
  );
  const intact = await verifyAuditChain();

  await tamper(sql`delete from audit_log where id = ${ids[0]}`);
  const oldestRemoved = await verifyAuditChain();

  await tamper(sql`update audit_log set changes = '{"title":{"from":"Old","to":"Forged"}}' where id = ${ids[2]}`);
  const tampered = await verifyAuditChain();

  await tamper(sql`delete from audit_log where id = ${ids[2]}`);
  const removed = await verifyAuditChain();

  return { ids, intact, oldestRemoved, tampered, removed };
});
