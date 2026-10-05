import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";

import {
  emit,
  expect,
  expectEmitted,
  expectListenerQueued,
  expectListenerRan,
  expectRow,
  runListener,
} from "@nuxvel/nuxt/testing";
import { $events, $listeners } from "#nuxvel/test-namespaces";
import { healthChecksTable } from "../../../playground/server/database/schema/health-check.schema";
import { setupPlayground } from "./helpers/playground";

describe("runListener()", async () => {
  await setupPlayground();

  it("runs a queued listener's handler in the app, here and now", async () => {
    const name = `run-listener-${randomUUID()}`;

    await runListener("_record-probe-queued", { name });

    await expectRow(healthChecksTable, { name });
  });

  it("rejects a payload the event's schema refuses", async () => {
    await expect(runListener("_record-probe-queued", { name: "" })).rejects.toBeTrpcError(
      "BAD_REQUEST",
    );
  });

  it("takes an event's and a listener's stub in place of their names", async () => {
    const name = `stub-${randomUUID()}`;

    await emit($events._probe.happened, { name, count: 1 });
    await emit($events._probe.queued, { name });
    await runListener($listeners._recordProbeQueued, { name: `${name}-run` });

    await expectEmitted($events._probe.happened, { name });
    await expectListenerRan($listeners._recordProbeSync);
    await expectListenerQueued($listeners._recordProbeQueued);
    await expectRow(healthChecksTable, { name: `${name}-run` });
  });
});
