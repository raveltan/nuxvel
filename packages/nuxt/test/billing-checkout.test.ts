import { randomUUID } from "node:crypto";
import { url } from "@nuxt/test-utils/e2e";
import { describe, it } from "vitest";
import { billingCustomersTable } from "@nuxvel/nuxt/database";
import { expect, expectCount, expectFetched, expectRow, fakeStripe, guest } from "@nuxvel/nuxt/testing";
import { setupPlayground } from "./helpers/playground";

function newUser() {
  const id = randomUUID();

  return { id, email: `${id}@nuxvel.test` };
}

async function startCheckout(body: Record<string, unknown>) {
  const answer = await guest().$fetch<{ url?: string; error?: string }>("/api/_billing-checkout-check", { method: "POST", body });

  if (!answer.url) throw new Error(answer.error);

  return { url: answer.url };
}

async function checkoutError(body: Record<string, unknown>) {
  const answer = await guest().$fetch<{ url?: string; error?: string }>("/api/_billing-checkout-check", { method: "POST", body });

  return answer.error ?? "";
}

async function failure(request: Promise<unknown>) {
  const error: { data?: { message?: string } } = await request.then(
    () => ({}),
    (caught: { data?: { message?: string } }) => caught,
  );

  return error.data?.message ?? "";
}

describe("checkout() and billingPortal()", async () => {
  await setupPlayground();

  it("starts a Checkout for the product's price and sends the user back to the app", async () => {
    const user = newUser();

    const { url: checkoutUrl } = await startCheckout({ user, product: "_pro" });

    expect(checkoutUrl).toMatch(new RegExp(`^${url("/_nuxvel/test/stripe/checkout/cs_test_")}`));

    const { stripeCustomerId } = await expectRow(billingCustomersTable, { userId: user.id, livemode: false });
    const request = await expectFetched("https://api.stripe.com/v1/checkout/sessions", { method: "POST", times: 1 });
    const sent = new URLSearchParams(request.body);

    expect(Object.fromEntries(sent)).toMatchObject({
      mode: "subscription",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      "line_items[0][price]": "price_test_pro_monthly",
      "line_items[0][quantity]": "1",
      success_url: url("/billing?session={CHECKOUT_SESSION_ID}"),
      cancel_url: url("/pricing"),
      "metadata[nuxvel_user]": user.id,
      "metadata[nuxvel_product]": "_pro",
      "subscription_data[metadata][nuxvel_product]": "_pro",
    });
  });

  it("starts a one-time payment for a payment product", async () => {
    await startCheckout({ user: newUser(), product: "_course" });

    const request = await expectFetched("https://api.stripe.com/v1/checkout/sessions", { method: "POST" });

    expect(Object.fromEntries(new URLSearchParams(request.body))).toMatchObject({
      mode: "payment",
      "line_items[0][price]": "price_test_course_once",
      "payment_intent_data[metadata][nuxvel_product]": "_course",
    });
  });

  it("creates one Stripe customer for a user, however many checkouts race", async () => {
    const user = newUser();

    await Promise.all([startCheckout({ user, product: "_pro" }), startCheckout({ user, product: "_pro" })]);
    await startCheckout({ user, product: "_course" });

    await expectCount(billingCustomersTable, 1, { userId: user.id });

    const { stripeCustomerId } = await expectRow(billingCustomersTable, { userId: user.id });
    const customers = new Set(
      (await Promise.all([1, 2, 3].map(() => expectFetched("https://api.stripe.com/v1/checkout/sessions", { method: "POST", times: 3 }))))
        .map((request) => new URLSearchParams(request.body).get("customer")),
    );

    expect([...customers]).toEqual([stripeCustomerId]);
  });

  it("refuses a return URL outside the app", async () => {
    const message = await checkoutError({ user: newUser(), product: "_pro", successUrl: "https://evil.example/steal" });

    expect(message).toContain("successUrl must be a path of the app");
  });

  it("refuses a product whose lookup key has no active price, or a price that does not fit its mode", async () => {
    await fakeStripe({ prices: { pro_monthly: null } });

    expect(await checkoutError({ user: newUser(), product: "_pro" })).toContain('no active Stripe price has the lookup key "pro_monthly"');

    await fakeStripe({ prices: { pro_monthly: { amount: 1900, interval: undefined } } });

    expect(await checkoutError({ user: newUser(), product: "_pro" })).toContain("is one_time, but the product");
  });

  it("opens the Customer Portal of a user who went through checkout, and refuses one who did not", async () => {
    const user = newUser();

    expect(await failure(guest().$fetch("/api/_billing-portal-check", { method: "POST", body: { user } }))).toBe("This user has no billing account yet");

    await startCheckout({ user, product: "_pro" });
    const { url: portalUrl } = await guest().$fetch<{ url: string }>("/api/_billing-portal-check", { method: "POST", body: { user } });
    const request = await expectFetched("https://api.stripe.com/v1/billing_portal/sessions", { method: "POST", times: 1 });

    expect(portalUrl).toMatch(new RegExp(`^${url("/_nuxvel/test/stripe/portal/bps_test_")}`));
    expect(new URLSearchParams(request.body).get("return_url")).toBe(url("/billing"));
  });

  it("answers Stripe from memory in a test build, and never reaches the network", async () => {
    expect(await guest().$fetch("/api/_billing-stripe-check")).toEqual({
      error: expect.stringContaining("in-memory Stripe of a test build has no GET /v1/balance"),
    });
  });
});
