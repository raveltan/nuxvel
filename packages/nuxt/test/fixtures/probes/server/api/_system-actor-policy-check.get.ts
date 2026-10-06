import { randomUUID } from "node:crypto";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { tagsTable } from "~~/server/database/schema/tags.schema";
import { webhookEndpointsTable } from "~~/server/database/schema/webhook-endpoints.schema";

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

  const guest = { type: "guest", id: "guest" };
  const endpoint = { id: 1, url: "https://example.com", secret: "secret", createdAt: new Date() };
  const tag = { id: 1, name: "probe", createdAt: new Date(), updatedAt: new Date() };

  return {
    guestDeniedByDefault: await can(guest, "probe", healthChecksTable, row),
    guestAllowed: await can(guest, "view", healthChecksTable, row),
    deniedWithoutPreload: [
      await can(guest, "rename", tagsTable, tag),
      await canMany(systemActor("backfill"), ["rename"], tagsTable, [tag]),
    ],
    composed: await Promise.all(
      (["watch", "follow"] as const).flatMap((rule) => [guest, systemActor("backfill")].map((actor) => can(actor, rule, webhookEndpointsTable, endpoint))),
    ),
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
