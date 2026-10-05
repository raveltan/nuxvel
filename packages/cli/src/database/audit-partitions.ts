import { loadNuxtConfig } from "@nuxt/kit";
import { maintainAuditLog } from "@nuxvel/nuxt/cli";
import type { Sql } from "postgres";
import { z } from "zod";
import { message, step } from "../ui/output.ts";

const auditConfigSchema = z.object({ nuxvel: z.object({ audit: z.object({ retentionMonths: z.number() }) }) });

export async function maintainAuditPartitions(cwd: string, sql: Sql) {
  const config = auditConfigSchema.safeParse(await loadNuxtConfig({ cwd }).catch(() => ({})));
  const result = await maintainAuditLog(sql, config.data?.nuxvel.audit.retentionMonths);

  if (!result) return;

  step(`Audit log partitions: created ${result.created.length}, dropped ${result.dropped.length}`);

  const changed = [...result.created.map((name) => `  created ${name}`), ...result.dropped.map((name) => `  dropped ${name}`)];

  if (changed.length > 0) message(changed);
}
