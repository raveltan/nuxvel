import { eq } from "drizzle-orm";
import { announceProbe } from "~~/server/actions/_probes/announce-probe";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

async function names(name: string) {
  const rows = await useDb()
    .select()
    .from(healthChecksTable)
    .where(eq(healthChecksTable.name, name));

  return rows.map((row) => row.name);
}

export default defineEventHandler(async () => {
  const actor = systemActor("_sync-listener-check");

  try {
    await announceProbe({ name: "sync-rolled-back", count: 1, fail: true }, { actor });
  } catch {}

  const afterRollback = await names("sync-rolled-back");

  await announceProbe({ name: "sync-committed", count: 2, fail: false }, { actor });

  const afterCommit = await names("sync-committed");

  return { afterRollback, afterCommit };
});
