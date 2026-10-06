import { auditLogTable } from "~~/server/database/schema/audit-log.schema";

const rolledBack = probeNamed("_audit-check.rolledBack", defineAction({
  handler: async () => {
    await audit("post.created", { id: 1 });
    throw new Error("boom");
  },
}));

const committed = probeNamed("_audit-check.committed", defineAction({
  handler: async () => {
    await audit("post.updated", { id: 2 }, { changes: { title: "new" } });
  },
}));

const typed = probeNamed("_audit-check.typed", defineAction({
  handler: () => audit("moderation.hidden", { type: "posts", id: 3 }),
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_audit-check");

  const before = await useDb().select().from(auditLogTable);

  try {
    await rolledBack({}, { actor });
  } catch {}

  const afterRollback = await useDb().select().from(auditLogTable);

  await committed({}, { actor });

  const afterCommit = await useDb().select().from(auditLogTable);

  await typed({}, { actor });

  const afterTyped = await useDb().select().from(auditLogTable);

  return {
    rolledBackRowAdded: afterRollback.length > before.length,
    committedRowAdded: afterCommit.length > afterRollback.length,
    committedRow: afterCommit.at(-1),
    typedRow: afterTyped.at(-1),
  };
});
