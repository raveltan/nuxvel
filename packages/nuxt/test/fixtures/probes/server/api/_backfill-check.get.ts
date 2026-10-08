import { asc, eq } from "drizzle-orm";
import { backfillsTable } from "~~/server/database/schema/backfills.schema";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import _probeNamesBackfill from "#server/database/backfills/_probe-names";
import { runBackfill } from "@nuxvel/nuxt/server/backfills";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

const NAMES = ["backfill-1", "backfill-2", "backfill-3-crash", "backfill-4", "backfill-5"];

async function probeState() {
  const { cursor, processed, total, completedAt } = await useDb()
    .select()
    .from(backfillsTable)
    .where(eq(backfillsTable.name, "_probe-names"))
    .then(firstOrFail);

  return { cursor, processed, total, completed: completedAt !== null };
}

export default defineEventHandler(async () => {
  const ids = await useDb()
    .insert(healthChecksTable)
    .values(NAMES.map((name) => ({ name })))
    .returning()
    .then((rows) => rows.map((row) => row.id));

  const crash = await runBackfill("_probe-names").then(
    () => null,
    (error: Error) => error.message,
  );
  const afterCrash = await probeState();

  await useDb()
    .update(healthChecksTable)
    .set({ name: "backfill-3" })
    .where(eq(healthChecksTable.name, "backfill-3-crash"));

  await runBackfill(_probeNamesBackfill);
  const afterResume = await probeState();

  const names = await useDb()
    .select({ name: healthChecksTable.name })
    .from(healthChecksTable)
    .orderBy(asc(healthChecksTable.id))
    .then((rows) => rows.map((row) => row.name));

  return { ids, crash, afterCrash, afterResume, names };
});
