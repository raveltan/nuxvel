import { randomUUID } from "node:crypto";
import { actorContext } from "../../../../../src/runtime/server/actions/context";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { tagsTable } from "~~/server/database/schema/tags.schema";
import { webhookEndpointsTable } from "~~/server/database/schema/webhook-endpoints.schema";
import { systemActor } from "@nuxvel/nuxt/server/actions";
import type { Actor } from "@nuxvel/nuxt/server/actions";
import { can, canMany } from "@nuxvel/nuxt/server/authorization";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

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
  const backfill = systemActor("backfill");
  const as = <T>(actor: Actor, run: () => Promise<T>) => actorContext.run(actor, run);
  const endpoint = { id: 1, url: "https://example.com", secret: "secret", createdAt: new Date() };
  const tag = { id: 1, name: "probe", createdAt: new Date(), updatedAt: new Date() };

  return {
    guestDeniedByDefault: await as(guest, () => can("probe", healthChecksTable, row)),
    guestAllowed: await as(guest, () => can("view", healthChecksTable, row)),
    deniedWithoutPreload: [
      await as(guest, () => can("rename", tagsTable, tag)),
      await as(backfill, () => canMany(["rename"], tagsTable, [tag])),
    ],
    composed: await Promise.all(
      (["watch", "follow"] as const).flatMap((rule) => [guest, backfill].map((actor) => as(actor, () => can(rule, webhookEndpointsTable, endpoint)))),
    ),
    updateDenied: await as(backfill, () => can("update", healthChecksTable, row)),
    probeAllowed: await as(backfill, () => can("probe", healthChecksTable, row)),
    probeDeniedForOtherRow: await as(backfill, () => can("probe", healthChecksTable, { ...row, name: "other" })),
  };
});
