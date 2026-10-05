import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";

import { emit, expect, expectMailSent, expectRow, runAction, runJob, workQueue } from "@nuxvel/nuxt/testing";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

describe("workQueue()", async () => {
  await setupPlayground({ env: { NUXT_MAIL_URL: "smtp://127.0.0.1:9" } });

  it("runs a queued job and the job it dispatches", async () => {
    const name = `work-queue-${randomUUID()}`;

    await runJob("_probe.chain", { name });
    await workQueue();

    await expectRow(healthChecksTable, { name });
  });

  it("runs a queued listener", async () => {
    const name = `work-queue-listener-${randomUUID()}`;

    await emit("_probe.queued", { name });
    await workQueue();

    await expectRow(healthChecksTable, { name });
  });

  it("does not deliver mail", async () => {
    await runAction("profile.send-test-mail", {}, { actingAs: await userFactory() });
    await workQueue();

    await expectMailSent("welcome");
  });

  it("rejects with the error of a failing job", async () => {
    await runJob("_probe.chain-failing", {});

    await expect(workQueue()).rejects.toThrow("probe.always-fails always fails");
  });
});
