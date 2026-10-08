import { eq } from "drizzle-orm";
import { findListener } from "../../../../../src/runtime/server/events/registry";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  const listener = findListener("_record-probe-queued");

  if (!listener) throw new Error("_record-probe-queued is not discovered");

  await listener.runQueued({ version: 1, payload: { label: "upcast-me" } });
  await listener.runQueued({ version: 2, payload: { name: "already-current" } });

  const rows = await useDb()
    .select()
    .from(healthChecksTable)
    .where(eq(healthChecksTable.name, "upcast-me"));

  const current = await useDb()
    .select()
    .from(healthChecksTable)
    .where(eq(healthChecksTable.name, "already-current"));

  let newerThrew = false;

  try {
    await listener.runQueued({ version: 3, payload: { name: "from-the-future" } });
  } catch {
    newerThrew = true;
  }

  return {
    version: listener.version,
    upcast: rows.map((row) => row.name),
    current: current.map((row) => row.name),
    newerThrew,
  };
});
