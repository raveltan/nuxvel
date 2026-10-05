import { describe, it } from "vitest";
import { billingCustomersTable, billingPaymentsTable, billingSubscriptionsTable } from "@nuxvel/nuxt/database";
import { completeCheckout, expect, expectFetched, expectNoRow, expectNotSubscribed, expectRow, fakeFetch, guest } from "@nuxvel/nuxt/testing";
import { $products } from "#nuxvel/test-namespaces";
import { userTable } from "../../../playground/server/database/schema/auth.schema";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

function erase(userId: string) {
  return guest().$fetch<{ erased?: Record<string, number>; error?: string }>("/api/_billing-erase-check", { method: "POST", body: { userId } });
}

describe("erasing a user with billing", async () => {
  await setupPlayground();

  it("cancels their subscriptions in Stripe first, and keeps their billing rows", async () => {
    const user = await userFactory();
    const { subscriptionId } = await completeCheckout(user, $products._pro);
    await completeCheckout(user, $products._course);

    const { erased, error } = await erase(user.id);

    expect(error).toBeUndefined();
    expect(erased?.user).toBe(1);
    await expectFetched(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, { method: "DELETE", times: 1 });
    const subscription = await expectRow(billingSubscriptionsTable, { id: subscriptionId, status: "canceled" });
    expect(subscription.endedAt).toBeInstanceOf(Date);
    await expectNotSubscribed(user);
    await expectRow(billingPaymentsTable, { userId: user.id, product: "_course", status: "paid" });
    await expectRow(billingCustomersTable, { userId: user.id });
    await expectNoRow(userTable, { id: user.id });
  });

  it("erases nothing when Stripe refuses to cancel a subscription", async () => {
    const user = await userFactory();
    await completeCheckout(user, $products._pro);
    await fakeFetch({
      "https://api.stripe.com/v1/subscriptions/*": { status: 400, body: { error: { type: "invalid_request_error", message: "Stripe is down for this test" } } },
    });

    const { error } = await erase(user.id);

    expect(error).toBe("Stripe is down for this test");
    await expectRow(userTable, { id: user.id });
    await expectRow(billingSubscriptionsTable, { userId: user.id, status: "active" });
  });
});
