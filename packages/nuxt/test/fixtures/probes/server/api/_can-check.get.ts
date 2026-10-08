import { randomUUID } from "node:crypto";
import { actorContext } from "../../../../../src/runtime/server/actions/context";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { healthCheckPolicy } from "~~/server/policies/health-check.policy";
import { userActor } from "@nuxvel/nuxt/server/actions";
import { can, canMany } from "@nuxvel/nuxt/server/authorization";
import { firstOrFail, useDb } from "@nuxvel/nuxt/server/database";

export default defineEventHandler(async () => {
  const owner = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Can Owner",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);
  const other = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Can Other",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);

  const row = await useDb()
    .insert(healthChecksTable)
    .values({ userId: owner.id, name: "owned" })
    .returning()
    .then(firstOrFail);

  const admin = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Can Admin",
      email: `${randomUUID()}@example.com`,
      role: "admin",
    })
    .returning()
    .then(firstOrFail);
  const post = await useDb()
    .insert(postsTable)
    .values({ title: "Owned", body: "Body", authorId: owner.id })
    .returning()
    .then(firstOrFail);

  const asOwner = <T>(run: () => Promise<T>) => actorContext.run({ type: "user", id: owner.id }, run);
  const asOther = <T>(run: () => Promise<T>) => actorContext.run({ type: "user", id: other.id }, run);
  let outsideRequest: string | undefined;

  try {
    await runOutsideRequest(() => can("update", healthChecksTable, row));
  } catch (error) {
    outsideRequest = error instanceof Error ? error.message : String(error);
  }

  return {
    adminAllowed: await actorContext.run(userActor(admin), () => can("update", postsTable, post)),
    ownerAllowed: await asOwner(() => can("update", healthChecksTable, row)),
    otherAllowed: await asOther(() => can("update", healthChecksTable, row)),
    ownerAllowedByRef: await asOwner(() => can(healthCheckPolicy.update, row)),
    otherAllowedByRef: await asOther(() => can(healthCheckPolicy.update, row)),
    // @ts-expect-error the policy defines no "destroy" rule; this checks the runtime denial
    unknownAction: await asOwner(() => can("destroy", healthChecksTable, row)),
    // @ts-expect-error "constructor" is no rule of the policy; this checks the runtime denial
    inheritedConstructor: await asOther(() => can("constructor", healthChecksTable, row)),
    // @ts-expect-error "toString" is no rule of the policy; this checks the runtime denial
    inheritedToString: await asOther(() => can("toString", healthChecksTable, row)),
    // @ts-expect-error "constructor" is no rule of the policy; this checks the runtime denial
    inheritedMany: await asOther(() => canMany(["constructor"], healthChecksTable, [row])),
    // @ts-expect-error no policy covers user; this checks the runtime denial
    unregisteredTable: await asOwner(() => can("update", userTable, owner)),
    guestInRequest: await can("update", healthChecksTable, row),
    outsideRequest,
  };
});
