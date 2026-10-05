import { getServerLogs, startServer, stopServer } from "@nuxt/test-utils/e2e";
import { describe, it } from "vitest";
import { expect, expectFetched, fakeFetch, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

describe("nuxvel.billing", async () => {
  await setupPlayground();

  it("sends each useStripe() request through fetch", async () => {
    await fakeFetch({ "https://api.stripe.com/v1/balance": { body: { object: "balance", available: [], pending: [], livemode: false } } });

    expect(await guest().$fetch("/api/_billing-stripe-check")).toEqual({ object: "balance" });

    await expectFetched("https://api.stripe.com/v1/balance", { method: "GET", times: 1 });
  });

  it.for([
    ["a live key", "sk_live_nuxvel", "NUXT_STRIPE_SECRET_KEY: A live key outside production"],
    ["a publishable key", "pk_test_nuxvel", "NUXT_STRIPE_SECRET_KEY: Not a Stripe secret key"],
  ])("refuses to boot outside production with %s", async ([, key, message]) => {
    await stopServer();

    try {
      await expect(startServer({ env: { NUXT_STRIPE_SECRET_KEY: key } })).rejects.toThrow();
      expect(getServerLogs().join("\n")).toContain(message);
    } finally {
      await startServer();
    }
  }, 120000);

  it("boots in production with a test key and warns that Stripe takes no real payment", async () => {
    await stopServer();

    try {
      await startServer({ env: { NODE_ENV: "production", NUXT_STRIPE_TEST_KEYS_ONLY: "false" } });
      expect(getServerLogs().join("\n")).toContain("NUXT_STRIPE_SECRET_KEY is a test key: Stripe takes no real payment");
    } finally {
      await stopServer();
      await startServer();
    }
  }, 120000);
});
