import { expect, guest } from "@nuxvel/nuxt/testing";
import { afterAll, describe, it } from "vitest";
import { startFakeSentry } from "@nuxvel/test-helpers/fake-sentry";
import { setupPlayground } from "./helpers/playground";

const sentry = await startFakeSentry();

describe("an onCommit hook that throws", async () => {
  await setupPlayground({ env: { NUXT_PUBLIC_SENTRY_DSN: sentry.dsn } });

  afterAll(() => sentry.close());

  it("still returns the action's result, runs the next hook, and reports the error", async () => {
    const body = await guest().$fetch("/api/_commit-hook-failure-check");

    expect(body).toEqual({ result: "committed", ran: ["first", "last"] });

    const event = await sentry.waitForEvent(
      (candidate) => candidate.exception?.values?.at(-1)?.value === "commit hook exploded",
    );

    expect(event).toBeDefined();
  });
});
