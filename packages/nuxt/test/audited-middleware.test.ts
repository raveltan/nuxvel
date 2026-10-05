import { describe, it } from "vitest";
import { actingAs, expect, expectAudited, expectNotAudited, guest } from "@nuxvel/nuxt/testing";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("audited() tRPC middleware", async () => {
  await setupPlayground();

  it("writes an audit row with only the changed field for the update mutation", async () => {
    const owner = await userFactory();
    const healthCheck = await healthCheckFactory({ userId: owner.id });

    await actingAs(owner).trpc.health.update({ id: healthCheck.id, name: "after" });

    const row = await expectAudited("health-checks.update", {
      actorType: "user",
      actorId: owner.id,
      targetType: "health_checks",
      targetId: String(healthCheck.id),
    });

    expect(row.changes).toEqual({ name: { from: "before", to: "after" } });
    await expectNotAudited("health-checks.delete", { targetId: String(healthCheck.id) });
    await expect(expectNotAudited("health-checks.update", { targetId: String(healthCheck.id) })).rejects.toThrow();
  });

  it("compares dates and JSON by value, so untouched ones are not changes", async () => {
    const body = await guest().$fetch("/api/_audited-middleware-check");

    const row = await expectAudited("_audited-check.renamed", {
      targetType: "outbox",
      targetId: String(body.renamedId),
    });

    expect(row.changes).toEqual({
      jobName: { from: "_audited-check.before", to: "_audited-check.after" },
    });
  });
});
