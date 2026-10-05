import { randomUUID } from "node:crypto";
import { describe, it } from "vitest";
import { billingEventsTable, billingSubscriptionsTable } from "@nuxvel/nuxt/database";
import { cancelSubscription, completeCheckout, deliverWebhook, expect, expectAudited, expectEmitted, expectNotSubscribed, expectRow, expectSubscribed, failRenewal, guest, renewSubscription, runJob } from "@nuxvel/nuxt/testing";
import { $products } from "#nuxvel/test-namespaces";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function isSubscribed(userId: string, product?: string) {
  const { subscribed } = await guest().$fetch<{ subscribed: boolean }>("/api/_billing-subscribed-check", { query: { user: userId, product } });

  return subscribed;
}

describe("subscriptions", async () => {
  await setupPlayground();

  it("subscribes a user once Stripe reports the paid checkout, with an audit entry and one event", async () => {
    const user = await userFactory();

    const { subscriptionId } = await completeCheckout(user, $products._pro);

    await expectSubscribed(user, $products._pro);
    const row = await expectRow(billingSubscriptionsTable, {
      id: subscriptionId,
      userId: user.id,
      product: "_pro",
      priceId: "price_test_pro_monthly",
      status: "active",
      cancelAtPeriodEnd: false,
      endedAt: null,
      livemode: false,
    });
    expect(row.currentPeriodEnd?.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    await expectAudited("billing.subscription.changed", { actorType: "system", actorId: "stripe", targetType: "user" });
    await expectEmitted(
      "nuxvel.billing.subscription-changed",
      { userId: user.id, product: "_pro", subscriptionId, status: "active", previousStatus: null },
      { times: 1 },
    );
    await expectRow(billingEventsTable, { type: "checkout.session.completed", attempts: 1, lastError: null });
    expect(await isSubscribed(user.id, "_pro")).toBe(true);
    expect(await isSubscribed(user.id)).toBe(true);
    expect(await isSubscribed(user.id, "_course")).toBe(false);
  });

  it("refuses a second checkout of a product the user already subscribes to", async () => {
    const user = await userFactory();

    await completeCheckout(user, $products._pro);
    const answer = await guest().$fetch<{ error?: string }>("/api/_billing-checkout-check", {
      method: "POST",
      body: { user: { id: user.id, email: user.email }, product: "_pro" },
    });

    expect(answer.error).toBe('This user already has a subscription to "_pro"');
  });

  it("takes access away while a renewal fails, and gives it back once it is paid", async () => {
    const user = await userFactory();
    await completeCheckout(user, $products._pro);

    await failRenewal(user, $products._pro);

    await expectNotSubscribed(user, $products._pro);
    await expectSubscribed(user, $products._pro, { status: "past_due" });
    await expectEmitted("nuxvel.billing.subscription-changed", { userId: user.id, status: "past_due", previousStatus: "active" });
    expect(await isSubscribed(user.id, "_pro")).toBe(false);

    await renewSubscription(user, $products._pro);

    await expectSubscribed(user, $products._pro);
    expect(await isSubscribed(user.id, "_pro")).toBe(true);
  });

  it("keeps access until the end of the period after a cancellation, and ends it on a cancellation now", async () => {
    const user = await userFactory();
    await completeCheckout(user, $products._pro);

    await cancelSubscription(user, $products._pro);

    await expectSubscribed(user, $products._pro);
    await expectRow(billingSubscriptionsTable, { userId: user.id, status: "active", cancelAtPeriodEnd: true });

    await cancelSubscription(user, $products._pro, { now: true });

    await expectNotSubscribed(user);
    const ended = await expectRow(billingSubscriptionsTable, { userId: user.id, status: "canceled" });
    expect(ended.endedAt).toBeInstanceOf(Date);
    expect(await isSubscribed(user.id)).toBe(false);
  });

  it("keeps the error and the attempt of an event that fails, so the queue retries it", async () => {
    const id = `evt_${randomUUID().replaceAll("-", "")}`;
    await deliverWebhook("stripe", {
      id,
      object: "event",
      type: "customer.subscription.updated",
      created: 1_790_000_000,
      livemode: false,
      data: { object: { id: "sub_test_missing", object: "subscription" } },
    });

    await expect(runJob("nuxvel.billing.process-event", { eventId: id })).rejects.toThrow("No such subscription");

    await expectRow(billingEventsTable, { id, attempts: 1, processedAt: null, lastError: "No such subscription: 'sub_test_missing'" });
  });
});
