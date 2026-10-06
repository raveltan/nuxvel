import { randomUUID } from "node:crypto";
import { actorContext } from "../../../../../src/runtime/server/actions/context";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";
import { healthCheckPolicy } from "~~/server/policies/health-check.policy";

export default defineEventHandler(async () => {
  const owner = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Authorize Owner",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);
  const other = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Authorize Other",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);

  const row = await useDb()
    .insert(healthChecksTable)
    .values({ userId: owner.id, name: "owned" })
    .returning()
    .then(firstOrFail);

  const asOwner = <T>(run: () => Promise<T>) => actorContext.run({ type: "user", id: owner.id }, run);
  const asOther = <T>(run: () => Promise<T>) => actorContext.run({ type: "user", id: other.id }, run);

  await asOwner(() => authorize("update", healthChecksTable, row));

  let deniedAs: string | null = null;
  try {
    await asOther(() => authorize("update", healthChecksTable, row));
  } catch (error) {
    deniedAs = error instanceof ForbiddenError ? "ForbiddenError" : "UNKNOWN";
  }

  let inheritedDeniedAs: string | null = null;
  try {
    // @ts-expect-error "constructor" is no rule of the policy; this checks the runtime denial
    await asOther(() => authorize("constructor", healthChecksTable, row));
  } catch (error) {
    inheritedDeniedAs = error instanceof ForbiddenError ? "ForbiddenError" : "UNKNOWN";
  }

  await asOwner(() => authorize(healthCheckPolicy.update, row));

  let deniedByRefAs: string | null = null;
  try {
    await asOther(() => authorize(healthCheckPolicy.update, row));
  } catch (error) {
    deniedByRefAs = error instanceof ForbiddenError ? error.message : "UNKNOWN";
  }

  return { ownerPassed: true, otherDeniedAs: deniedAs, inheritedDeniedAs, deniedByRefAs };
});
