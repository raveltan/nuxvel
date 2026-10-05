import { randomUUID } from "node:crypto";
import discoveredPolicies from "#nuxvel/policies";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { userTable } from "~~/server/database/schema/auth.schema";

export default defineEventHandler(async () => {
  const owner = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Policy Owner",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);
  const other = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Policy Other",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);

  const row = await useDb()
    .insert(healthChecksTable)
    .values({ userId: owner.id, name: "owned" })
    .returning()
    .then(firstOrFail);

  const policies: Policy[] = discoveredPolicies;
  const policy = policies.find(
    (candidate) => candidate.tableName === "health_checks",
  );

  if (!policy) throw new Error("no policy discovered for health_checks");

  const update = policy.rules.update;

  if (!update) throw new Error("health_checks policy has no update rule");

  const ownerAllowed = await update({ type: "user", id: owner.id }, row, undefined);
  const otherAllowed = await update({ type: "user", id: other.id }, row, undefined);

  return { tableName: policy.tableName, ownerAllowed, otherAllowed };
});
