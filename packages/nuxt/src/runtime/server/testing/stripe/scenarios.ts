import { and, desc, eq } from "drizzle-orm";
import { useNitroApp } from "nitropack/runtime";
import { useDb } from "../../database/client";
import { BILLING_PROCESS_JOB_NAME } from "../../billing/jobs/billing-job-name";
import { checkout } from "../../billing/checkout";
import { findProduct, productStoredName } from "../../billing/products";
import { billingPaymentsTable, billingSubscriptionsTable } from "../../billing/tables";
import { runJob } from "../run-job";
import { signWebhook } from "../sign-webhook";
import { recordStripeEvent } from "./events";
import { fakePrice } from "./prices";
import { type StripeObject, findStripeObject, saveStripeObject } from "./state";
import type { StripeScenarioResult } from "./scenario-result";
import { chargeOf, createPayment, disputeCharge, refundCharge } from "./payments";
import { cancelSubscriptionAt, createSubscription, failSubscriptionRenewal, renewSubscription } from "./subscriptions";


function lineItem(session: StripeObject) {
  const items = session.line_items;
  const first = typeof items === "object" && items !== null && "data" in items && Array.isArray(items.data) ? items.data[0] : undefined;
  const priceId = typeof first?.price?.id === "string" ? first.price.id : "";
  const price = fakePrice(priceId);

  if (!price) throw new Error(`The in-memory Checkout session ${session.id} has no price`);

  return { price, quantity: Number(first?.quantity ?? 1) };
}

function metadataOf(holder: unknown) {
  return typeof holder === "object" && holder !== null && "metadata" in holder ? holder.metadata : {};
}

export async function deliverStripeEvents(events: StripeObject[]) {
  for (const event of events) {
    const { rawBody, headers } = signWebhook("stripe", event);
    const response = await useNitroApp().localFetch("/api/webhooks/stripe", { method: "POST", headers, body: rawBody });

    if (!response.ok) throw new Error(`The Stripe webhook answered ${response.status} to ${String(event.type)}: ${await response.text()}`);

    await runJob(BILLING_PROCESS_JOB_NAME, { eventId: event.id });
  }
}

export async function payCheckoutSession(sessionId: string, deliver = true): Promise<StripeScenarioResult> {
  const session = findStripeObject(sessionId);

  if (session?.object !== "checkout.session" || session.status !== "open") {
    throw new Error(`No open Checkout session ${sessionId} in the in-memory Stripe`);
  }

  if (session.mode === "payment") {
    const { paymentIntent } = createPayment(session);
    const completed = saveStripeObject({ ...session, status: "complete", payment_status: "paid", payment_intent: paymentIntent.id });

    const events = [recordStripeEvent("checkout.session.completed", completed)];

    if (deliver) await deliverStripeEvents(events);

    return { checkoutSessionId: sessionId, paymentIntentId: paymentIntent.id };
  }

  const { price, quantity } = lineItem(session);
  const customer = String(session.customer);
  const subscription = createSubscription(customer, price, quantity, metadataOf(session.subscription_data));
  const completed = saveStripeObject({ ...session, status: "complete", payment_status: "paid", subscription: subscription.id });

  const events = [recordStripeEvent("customer.subscription.created", subscription), recordStripeEvent("checkout.session.completed", completed)];

  if (deliver) await deliverStripeEvents(events);

  return { checkoutSessionId: sessionId, subscriptionId: subscription.id };
}

function productNamed(name: string) {
  const product = findProduct(name);

  if (!product) throw new Error(`No product is named "${name}"`);

  return product;
}

export async function completeFakeCheckout(user: { id: string; email: string }, productName: string): Promise<StripeScenarioResult> {
  const url = await checkout(user, productNamed(productName), { successUrl: "/", cancelUrl: "/" });
  const sessionId = new URL(url).pathname.split("/").at(-1) ?? "";

  return payCheckoutSession(sessionId);
}

async function userSubscription(userId: string, productName: string) {
  const product = productStoredName(productNamed(productName));
  const [row] = await useDb({ root: true })
    .select()
    .from(billingSubscriptionsTable)
    .where(and(eq(billingSubscriptionsTable.userId, userId), eq(billingSubscriptionsTable.product, product)))
    .orderBy(desc(billingSubscriptionsTable.createdAt))
    .limit(1);
  const subscription = row ? findStripeObject(row.id) : undefined;

  if (!subscription) throw new Error(`The user ${userId} has no subscription to "${productName}"; call completeCheckout() first`);

  return subscription;
}

export async function changeFakeSubscription(
  userId: string,
  productName: string,
  change: "renew" | "fail-renewal" | "cancel" | "cancel-now",
): Promise<StripeScenarioResult> {
  const subscription = await userSubscription(userId, productName);
  const changed =
    change === "renew"
      ? renewSubscription(subscription)
      : change === "fail-renewal"
        ? failSubscriptionRenewal(subscription)
        : cancelSubscriptionAt(subscription, change === "cancel");

  await deliverStripeEvents([recordStripeEvent(change === "cancel-now" ? "customer.subscription.deleted" : "customer.subscription.updated", changed)]);

  return { subscriptionId: changed.id };
}

async function userPayment(userId: string, productName: string) {
  const product = productStoredName(productNamed(productName));
  const [row] = await useDb({ root: true })
    .select()
    .from(billingPaymentsTable)
    .where(and(eq(billingPaymentsTable.userId, userId), eq(billingPaymentsTable.product, product)))
    .orderBy(desc(billingPaymentsTable.createdAt))
    .limit(1);

  if (!row) throw new Error(`The user ${userId} has no payment for "${productName}"; call completeCheckout() first`);

  return row;
}

export async function refundFakePayment(userId: string, productName: string, amount?: number): Promise<StripeScenarioResult> {
  const payment = await userPayment(userId, productName);
  const charge = refundCharge(chargeOf(payment.paymentIntentId), amount);

  await deliverStripeEvents([recordStripeEvent("charge.refunded", charge)]);

  return { checkoutSessionId: payment.checkoutSessionId, paymentIntentId: payment.paymentIntentId };
}

export async function disputeFakePayment(userId: string, productName: string, reason: string): Promise<StripeScenarioResult> {
  const payment = await userPayment(userId, productName);
  const dispute = disputeCharge(chargeOf(payment.paymentIntentId), reason);

  await deliverStripeEvents([recordStripeEvent("charge.dispute.created", dispute)]);

  return { checkoutSessionId: payment.checkoutSessionId, paymentIntentId: payment.paymentIntentId };
}
