import { auditLogTable } from "~~/server/database/schema/audit-log.schema";

const withRedactedFields = probeNamed("_audit-redaction-check.withRedactedFields", defineAction({
  handler: async () => {
    await audit(
      "user.updated",
      { id: 1 },
      { changes: { password: "hunter2", role: "admin" } },
    );
  },
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_audit-redaction-check");

  await withRedactedFields({}, { actor });

  const rows = await useDb().select().from(auditLogTable);

  return {
    row: rows.at(-1),
  };
});
