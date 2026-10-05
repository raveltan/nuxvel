import { describe, it } from "vitest";
import { billingEventsTable, billingPaymentsTable, billingSubscriptionsTable } from "@nuxvel/nuxt/database";
import { completeCheckout, disputePayment, expect, expectAudited, expectEmitted, expectNoRow, expectNotPaid, expectPaid, expectRow, fakeStripe, guest, refundPayment } from "@nuxvel/nuxt/testing";
import { $products } from "#nuxvel/test-namespaces";
import { userFactory } from "../../../playground/server/factories/users.factory";
import { setupPlayground } from "./helpers/playground";

async function hasPaid(userId: string) {
  const { paid } = await guest().$fetch<{ paid: boolean }>("/api/_billing-paid-check", { query: { user: userId, product: "_course" } });

  return paid;
}

describe("one-time payments", async () => {
  await setupPlayground();

  it("records a paid Checkout once Stripe confirms it, with an audit entry and one event", async () => {
    const user = await userFactory();

    const { checkoutSessionId, paymentIntentId } = await completeCheckout(user, $products._course);

    await expectPaid(user, $products._course);
    await expectRow(billingPaymentsTable, {
      checkoutSessionId,
      paymentIntentId,
      userId: user.id,
      product: "_course",
      priceId: "price_test_course_once",
      amount: 1000,
      amountRefunded: 0,
      currency: "usd",
      status: "paid",
      livemode: false,
    });
    await expectNoRow(billingSubscriptionsTable, { userId: user.id });
    await expectAudited("billing.payment.paid", { actorType: "system", actorId: "stripe", targetType: "user" });
    await expectEmitted("nuxvel.billing.paid", { userId: user.id, product: "_course", checkoutSessionId, amount: 1000, currency: "usd" }, { times: 1 });
    expect(await hasPaid(user.id)).toBe(true);
  });

  it("records the amount of the price in Stripe", async () => {
    const user = await userFactory();
    await fakeStripe({ prices: { course_once: { amount: 2500, currency: "eur" } } });

    await completeCheckout(user, $products._course);

    await expectRow(billingPaymentsTable, { userId: user.id, amount: 2500, currency: "eur" });
  });

  it("keeps the product after a partial refund and takes it away after a full one", async () => {
    const user = await userFactory();
    await completeCheckout(user, $products._course);

    await refundPayment(user, $products._course, { amount: 400 });

    await expectPaid(user, $products._course, { status: "partially_refunded" });
    await expectRow(billingPaymentsTable, { userId: user.id, amountRefunded: 400 });
    await expectEmitted("nuxvel.billing.refunded", { userId: user.id, amountRefunded: 400, fullyRefunded: false });
    expect(await hasPaid(user.id)).toBe(true);

    await refundPayment(user, $products._course);

    await expectNotPaid(user, $products._course);
    await expectPaid(user, $products._course, { status: "refunded" });
    await expectEmitted("nuxvel.billing.refunded", { userId: user.id, amountRefunded: 1000, fullyRefunded: true });
    await expectAudited("billing.payment.refunded", { actorType: "system", actorId: "stripe" });
    expect(await hasPaid(user.id)).toBe(false);
  });

  it("takes the product away on a dispute", async () => {
    const user = await userFactory();
    await completeCheckout(user, $products._course);

    await disputePayment(user, $products._course);

    await expectNotPaid(user, $products._course);
    await expectPaid(user, $products._course, { status: "disputed" });
    await expectEmitted("nuxvel.billing.disputed", { userId: user.id, product: "_course", reason: "fraudulent" }, { times: 1 });
    await expectAudited("billing.payment.disputed", { actorType: "system", actorId: "stripe" });
    expect(await hasPaid(user.id)).toBe(false);
  });

  it("refuses a paid session whose amount is not the price of the product, and records nothing", async () => {
    const user = await userFactory();

    const { error } = await guest().$fetch<{ error: string | null }>("/api/_billing-tampered-check", {
      method: "POST",
      body: { user: { id: user.id, email: user.email } },
    });

    expect(error).toContain('charged 1 usd, not the price of "_course"');
    await expectNotPaid(user, $products._course);
    await expectNoRow(billingPaymentsTable, { userId: user.id });
    await expectRow(billingEventsTable, { type: "checkout.session.completed", processedAt: null, attempts: 1 });
  });
});
