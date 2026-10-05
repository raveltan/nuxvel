import { describe, it } from "vitest";

import { actingAs, expect, expectRow } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("update-health-check action (owner-only via policy)", async () => {
  await setupPlayground();

  it("lets the owner update and forbids another user", async () => {
    const owner = await userFactory();
    const row = await healthCheckFactory({ userId: owner.id });

    const updated = await actingAs(owner).trpc.health.update({ id: row.id, name: "after" });

    expect(updated.name).toBe("after");
    await expect(
      actingAs(await userFactory()).trpc.health.update({ id: row.id, name: "hacked" }),
    ).rejects.toBeTrpcError("FORBIDDEN");

    const stored = await expectRow(healthChecksTable, { id: row.id });
    expect(stored).toMatchObject({ name: "after" });
  });
});
