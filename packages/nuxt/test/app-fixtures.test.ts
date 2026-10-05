import { describe, it } from "vitest";

import {
  emit,
  expect,
  expectEmitted,
  expectListenerQueued,
  expectListenerRan,
  expectRow,
  renderMail,
  runBackfill,
} from "@nuxvel/nuxt/testing";
import { $backfills } from "#nuxvel/test-namespaces";
import { backfillsTable } from "../../../playground/server/database/schema/backfills.schema";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { healthCheckFactory } from "../../../playground/server/factories/health-checks.factory";
import { setupPlayground } from "./helpers/playground";

describe("renderMail() / emit() / runBackfill()", async () => {
  await setupPlayground();

  it("renders a mail's subject, inlined HTML and text in the app, validating its input", async () => {
    const { subject, html, text } = await renderMail("welcome", { to: "ada@example.com", name: "Ada" });

    expect(subject).toBe("Welcome, Ada");
    expect(html).toMatch(/font-weight:700;[^"]*"[^>]*>\s*<h1 style="[^"]*font-weight:inherit;[^"]*">Welcome, Ada!<\/h1>/);
    expect(text).toContain("Thanks for signing up.");
    await expect(renderMail("welcome", { to: "not an address", name: "Ada" })).rejects.toHaveValidationErrors(
      "to",
    );
  });

  it("emits an event in the app, running sync listeners and queueing the rest", async () => {
    await emit("_probe.happened", { name: "emitted-by-test", count: 1 });
    await emit("_probe.queued", { name: "queued-by-test" });

    await expectEmitted("_probe.happened", { name: "emitted-by-test" });
    await expectListenerRan("_record-probe-sync");
    await expectRow(healthChecksTable, { name: "emitted-by-test" });
    await expectListenerQueued("_record-probe-queued");
  });

  it("runs a backfill to completion in the app, given its stub", async () => {
    await healthCheckFactory({ name: "backfill-a" });
    await healthCheckFactory({ name: "backfill-b" });

    await runBackfill($backfills._probeNames);

    await expectRow(healthChecksTable, { name: "backfill-a+" });
    await expectRow(healthChecksTable, { name: "backfill-b+" });
    const state = await expectRow(backfillsTable, { name: "_probe-names" });
    expect(state.completedAt).toBeInstanceOf(Date);
  });
});
