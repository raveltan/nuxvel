import { randomUUID } from "node:crypto";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";

export default defineEventHandler(async () => {
  const owner = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "System Actor Check Owner",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);

  const row = await useDb()
    .insert(healthChecksTable)
    .values({ userId: owner.id, name: "probe" })
    .returning()
    .then(firstOrFail);

  return {
    updateDenied: await can(
      systemActor("backfill"),
      "update",
      healthChecksTable,
      row,
    ),
    probeAllowed: await can(
      systemActor("backfill"),
      "probe",
      healthChecksTable,
      row,
    ),
    probeDeniedForOtherRow: await can(
      systemActor("backfill"),
      "probe",
      healthChecksTable,
      {
        ...row,
        name: "other",
      },
    ),
  };
});
