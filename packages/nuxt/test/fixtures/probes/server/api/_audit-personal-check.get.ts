import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auditLogTable } from "~~/server/database/schema/audit-log.schema";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { audit } from "@nuxvel/nuxt/server/audit";
import { useDb } from "@nuxvel/nuxt/server/database";

const changeEmail = probeNamed("_audit-personal-check.change-email", defineAction({
  input: z.object({ userId: z.string() }),
  handler: ({ userId }) =>
    audit("user.updated", { type: "user", id: userId }, {
      changes: {
        email: { from: "old@example.com", to: "new@example.com" },
        role: { from: "user", to: "admin" },
      },
    }),
}));

export default defineEventHandler(async () => {
  const userId = randomUUID();

  await changeEmail({ userId }, { actor: systemActor("_audit-personal-check") });

  const [entry] = await useDb()
    .select({ changes: auditLogTable.changes })
    .from(auditLogTable)
    .where(eq(auditLogTable.actorId, "_audit-personal-check"));

  return { changes: entry?.changes };
});
