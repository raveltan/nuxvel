import { describe, it } from "vitest";

import { expectAudited, expectCount, runSchedule } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { setupPlayground } from "./helpers/playground";

describe("runSchedule()", async () => {
  await setupPlayground();

  it("runs the schedule's handler in the app now, once per call", async () => {
    await runSchedule("_probe.tick");
    await runSchedule("_probe.tick");

    await expectCount(healthChecksTable, 2, { name: "ticked" });
  });

  it("runs the handler as a system actor named after the schedule", async () => {
    await runSchedule("_probe.tick");

    await expectAudited("_probe.ticked", { actorType: "system", actorId: "_probe.tick", targetType: "health_checks" });
  });
});
