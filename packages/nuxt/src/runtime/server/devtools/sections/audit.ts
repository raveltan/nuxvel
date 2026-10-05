import { desc } from "drizzle-orm";
import { useDb } from "../../database/client";
import { schemaTable } from "../../database/schema-table";
import { defineDevtoolsSection } from "../define-devtools-section";
import type { AuditSectionData } from "../../../shared/devtools/sections/audit";

const RECENT_LIMIT = 20;

export default defineDevtoolsSection<AuditSectionData>({
  id: "audit",
  title: "Recent audit entries",
  order: 20,
  load: async () => {
    const auditLog = schemaTable("audit_log");
    const entries = await useDb()
      .select({
        id: auditLog.id,
        occurredAt: auditLog.occurredAt,
        actorType: auditLog.actorType,
        actorId: auditLog.actorId,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
      })
      .from(auditLog)
      .orderBy(desc(auditLog.id))
      .limit(RECENT_LIMIT);

    return entries.map((entry) => ({ ...entry, occurredAt: entry.occurredAt.toISOString() }));
  },
});
