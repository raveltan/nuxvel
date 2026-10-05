import type { FakeStripeOptions } from "../../runtime/server/testing/stripe/state";
import { callControlChannel } from "../control-channel";

/**
 * Sets the prices of the in-memory Stripe that answers every Stripe
 * request in a test build, and what its test Checkout page does, for
 * the rest of the test.
 *
 * Without it, each product under `server/products/` has a price under
 * its lookup key: 1000 in `usd`, renewing each month for a
 * subscription. A key of `prices` changes that price, or adds one for
 * another lookup key; `null` leaves the key with no active price.
 * `@nuxvel/nuxt/testing/setup` clears the in-memory Stripe after every
 * test. Each Stripe request is recorded for {@link expectFetched}.
 *
 * In a test build, `checkout()` and `billingPortal()` return the URLs of
 * test pages of the app in place of Stripe's. The Checkout page pays the
 * session through the real Stripe webhook and job, then sends the
 * browser to the success URL; the portal page cancels a subscription at
 * the end of its period, then sends the browser to the return URL.
 *
 * @param options.prices The prices by lookup key: `amount` in the
 * currency's smallest unit, `currency`, and `interval` for a price that
 * renews.
 * @param options.checkout What the test Checkout page does when the
 * browser opens it: `"pay"` pays at once, `"decline"` goes to the
 * cancel URL, and `"manual"`, the default, shows a Pay and a Cancel
 * button.
 *
 * @example
 * ```ts
 * await fakeStripe({ prices: { pro_monthly: { amount: 1900, currency: "eur", interval: "month" } } });
 * await fakeStripe({ checkout: "pay" });
 * ```
 */
export async function fakeStripe(options: FakeStripeOptions = {}): Promise<void> {
  await callControlChannel("fake-stripe", options);
}
