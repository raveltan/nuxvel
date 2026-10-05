import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditContextTable, auditLogTable, auditSubjectsTable } from "~~/server/database/schema/audit-log.schema";
import { userTable } from "~~/server/database/schema/auth.schema";

const promote = probeNamed("_audit-subjects-check.promote", defineAction({
  input: z.object({ userId: z.string() }),
  handler: ({ userId }) => audit("user.promoted", { type: "user", id: userId }),
}));

export default defineEventHandler(async () => {
  const person = await useDb()
    .insert(userTable)
    .values({ id: randomUUID(), name: "Ada Audited", email: `${randomUUID()}@example.com` })
    .returning()
    .then(firstOrFail);

  await promote({ userId: person.id }, { actor: { type: "user", id: person.id } });

  const subjects = await useDb().select().from(auditSubjectsTable).where(eq(auditSubjectsTable.userId, person.id));
  const entry = await useDb()
    .select()
    .from(auditLogTable)
    .where(eq(auditLogTable.targetId, subjects[0]?.id ?? ""))
    .then(firstOrFail);

  return {
    userId: person.id,
    entry,
    subjects,
    context: await useDb().select().from(auditContextTable).where(eq(auditContextTable.entryId, entry.id)),
  };
});
