import { like } from "drizzle-orm";
import { z } from "zod";
import { auditLogTable } from "~~/server/database/schema/audit-log.schema";
import { defineAction, systemActor } from "@nuxvel/nuxt/server/actions";
import { currentRequestId, useCaller } from "@nuxvel/nuxt/server/api";
import { audit } from "@nuxvel/nuxt/server/audit";
import { useDb } from "@nuxvel/nuxt/server/database";

const auditFromHandler = probeNamed("_request-id-audit-check.auditFromHandler", defineAction({
  input: z.object({}),
  handler: () => audit("request-id.from-handler", { id: 1 }),
}));

export default defineEventHandler(async () => {
  await auditFromHandler({}, { actor: systemActor("_request-id-audit-check") });
  await useCaller()._requestIdCheck.audit();

  const rows = await useDb()
    .select({ action: auditLogTable.action, requestId: auditLogTable.requestId })
    .from(auditLogTable)
    .where(like(auditLogTable.action, "request-id.%"))
    .orderBy(auditLogTable.id);

  return { requestId: currentRequestId(), rows };
});
