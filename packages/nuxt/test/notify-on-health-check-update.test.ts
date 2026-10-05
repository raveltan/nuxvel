import { describe, it } from "vitest";

import { actingAs, expect, expectQueued, expectNotQueued } from "@nuxvel/nuxt/testing";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("health-check.notify-on-update dispatch", async () => {
  await setupPlayground();

  it("dispatches after a successful update", async () => {
    const owner = await userFactory();
    const row = await healthCheckFactory({ userId: owner.id });

    await actingAs(owner).trpc.health.update({ id: row.id, name: "after" });

    await expectQueued("health-check.notify-on-update", { id: row.id });
  });

  it("dispatches nothing after a forbidden update", async () => {
    const row = await healthCheckFactory({ userId: (await userFactory()).id });

    await expect(
      actingAs(await userFactory()).trpc.health.update({ id: row.id, name: "hacked" }),
    ).rejects.toBeTrpcError("FORBIDDEN");
    await expectNotQueued("health-check.notify-on-update");
  });
});
