import { randomUUID } from "node:crypto";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { postsTable } from "~~/server/database/schema/posts.schema";
import { healthCheckPolicy } from "~~/server/policies/health-check.policy";

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

  return {
    adminAllowed: await can(userActor(admin), "update", postsTable, post),
    ownerAllowed: await can(
      { type: "user", id: owner.id },
      "update",
      healthChecksTable,
      row,
    ),
    otherAllowed: await can(
      { type: "user", id: other.id },
      "update",
      healthChecksTable,
      row,
    ),
    ownerAllowedByRef: await can({ type: "user", id: owner.id }, healthCheckPolicy.update, row),
    otherAllowedByRef: await can({ type: "user", id: other.id }, healthCheckPolicy.update, row),
    unknownAction: await can(
      { type: "user", id: owner.id },
      // @ts-expect-error the policy defines no "destroy" rule; this checks the runtime denial
      "destroy",
      healthChecksTable,
      row,
    ),
    inheritedConstructor: await can(
      { type: "user", id: other.id },
      // @ts-expect-error "constructor" is no rule of the policy; this checks the runtime denial
      "constructor",
      healthChecksTable,
      row,
    ),
    inheritedToString: await can(
      { type: "user", id: other.id },
      // @ts-expect-error "toString" is no rule of the policy; this checks the runtime denial
      "toString",
      healthChecksTable,
      row,
    ),
    inheritedMany: await canMany(
      { type: "user", id: other.id },
      // @ts-expect-error "constructor" is no rule of the policy; this checks the runtime denial
      ["constructor"],
      healthChecksTable,
      [row],
    ),
    unregisteredTable: await can(
      { type: "user", id: owner.id },
      // @ts-expect-error no policy covers user; this checks the runtime denial
      "update",
      userTable,
      owner,
    ),
  };
});
