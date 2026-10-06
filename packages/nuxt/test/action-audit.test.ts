import { actingAs, expect, expectAudited, expectNotAudited, guest } from "@nuxvel/nuxt/testing";
import { describe, it } from "vitest";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("the audit option of defineAction", async () => {
  await setupPlayground();

  it("audits the returned row, records the changed columns of a target, and writes nothing when the handler throws", async () => {
    const { id } = await guest().$fetch("/api/_action-audit-check");

    await expectAudited("_action-audit-check.created", {
      actorType: "system",
      actorId: "_action-audit-check",
      targetType: "_action-audit-check",
      targetId: String(id),
    });
    const renamed = await expectAudited("_action-audit-check.renamed", { targetType: "outbox", targetId: String(id) });
    expect(renamed.changes).toEqual({ jobName: { from: "_action-audit-check.before", to: "_action-audit-check.after" } });
    await expectNotAudited("_action-audit-check.failing");
  });

  it("audits the change a procedure makes through the action, as the caller", async () => {
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
  });
});
