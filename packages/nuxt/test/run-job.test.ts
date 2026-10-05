import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";

import { expect, expectNotQueued, expectQueued, expectRow, runJob } from "@nuxvel/nuxt/testing";
import { $jobs } from "#nuxvel/test-namespaces";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { setupPlayground } from "./helpers/playground";

describe("runJob()", async () => {
  await setupPlayground();

  it("runs the handler in the app immediately without queueing anything", async () => {
    const name = `run-job-${randomUUID()}`;

    await runJob("_probe.record", { name });

    await expectRow(healthChecksTable, { name });
    await expectNotQueued("_probe.record");
  });

  it("runs a job named by its $jobs stub", async () => {
    const name = `run-job-stub-${randomUUID()}`;

    await runJob($jobs._probe.record, { name });

    await expectRow(healthChecksTable, { name });
    await expectNotQueued($jobs._probe.record);
  });

  it("queues what the handler dispatches in turn", async () => {
    const name = `run-job-chain-${randomUUID()}`;

    await runJob("_probe.chain", { name });

    await expectQueued("_probe.record", { name });
  });

  it("rejects so a test can tell a job that fails at once from one that retries", async () => {
    await expect(runJob("_probe.record", { name: "" })).rejects.toBeUnrecoverable();
    await expect(runJob("_probe.conflicts", {})).rejects.toBeUnrecoverable();
    await expect(runJob("_probe.always-fails", {})).rejects.toBeRetryable();
    await expect(runJob("_probe.always-fails", {})).rejects.not.toBeUnrecoverable();
  });
});
