import { describe, it } from "vitest";

import { actingAs, expect, expectRow } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("create-health-check action", async () => {
  await setupPlayground();

  it("creates a health check through actingAs's caller", async () => {
    const { api } = actingAs(await userFactory());

    const created = await api.health.create({});

    expect(created.id).toEqual(expect.any(Number));
    await expectRow(healthChecksTable, { id: created.id });
  });
});
