import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { expectNotQueued, expectQueued, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("the mail suppression list", async () => {
  await setupPlayground();

  it("dispatches nothing for a suppressed address", async () => {
    const to = `bounced-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to, suppressed: "yes" },
    });

    await expectNotQueued("nuxvel.mail");
  });

  it("dispatches the mail job for a clean address", async () => {
    const to = `clean-${randomUUID()}@nuxvel.test`;

    await guest().$fetch("/api/_mail-suppression-check", {
      query: { to, suppressed: "no" },
    });

    await expectQueued("nuxvel.mail", { to, subject: "Welcome, Ada" });
  });
});
