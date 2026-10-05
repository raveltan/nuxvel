import { type StripeObject, type StripeReply, findStripeObject, nextStripeId, saveStripeObject, stripeError, stripeTimestamp } from "./state";

const INTERVAL_SECONDS: Record<string, number> = { day: 86_400, week: 604_800, month: 2_592_000, year: 31_536_000 };

interface SubscriptionItem {
  id: string;
  object: "subscription_item";
  price: StripeObject;
  quantity: number;
  current_period_start: number;
  current_period_end: number;
}

function intervalOf(price: StripeObject) {
  const recurring = price.recurring;
  const interval = typeof recurring === "object" && recurring !== null && "interval" in recurring ? String(recurring.interval) : "month";

  return INTERVAL_SECONDS[interval] ?? INTERVAL_SECONDS.month ?? 0;
}

function itemOf(subscription: StripeObject): SubscriptionItem {
  const items = subscription.items;
  const item = typeof items === "object" && items !== null && "data" in items && Array.isArray(items.data) ? items.data[0] : undefined;

  if (!item) throw new Error(`The in-memory subscription ${subscription.id} has no item`);

  return item;
}

export function createSubscription(customer: string, price: StripeObject, quantity: number, metadata: unknown): StripeObject {
  const start = stripeTimestamp();
  const item: SubscriptionItem = {
    id: nextStripeId("si"),
    object: "subscription_item",
    price,
    quantity,
    current_period_start: start,
    current_period_end: start + intervalOf(price),
  };

  return saveStripeObject({
    id: nextStripeId("sub"),
    object: "subscription",
    customer,
    status: "active",
    metadata,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: { object: "list", data: [item] },
    created: start,
    livemode: false,
  });
}

export function renewSubscription(subscription: StripeObject): StripeObject {
  const item = itemOf(subscription);
  const start = Math.max(item.current_period_end, stripeTimestamp());
  const renewed: SubscriptionItem = { ...item, current_period_start: start, current_period_end: start + intervalOf(item.price) };

  return saveStripeObject({ ...subscription, status: "active", items: { object: "list", data: [renewed] } });
}

export function failSubscriptionRenewal(subscription: StripeObject): StripeObject {
  return saveStripeObject({ ...subscription, status: "past_due" });
}

export function cancelSubscriptionAt(subscription: StripeObject, atPeriodEnd: boolean): StripeObject {
  const at = stripeTimestamp();

  if (atPeriodEnd) return saveStripeObject({ ...subscription, cancel_at_period_end: true, canceled_at: at });

  return saveStripeObject({ ...subscription, status: "canceled", canceled_at: at, ended_at: at });
}

export function cancelSubscriptionNow(id: string): StripeReply {
  const subscription = findStripeObject(id);

  if (subscription?.object !== "subscription") return stripeError(404, `No such subscription: '${id}'`);
  if (subscription.status === "canceled") return stripeError(400, `The subscription ${id} is already canceled.`, "resource_already_canceled");

  return { status: 200, body: cancelSubscriptionAt(subscription, false) };
}

export function retrieveSubscription(id: string): StripeReply {
  const subscription = findStripeObject(id);

  return subscription?.object === "subscription" ? { status: 200, body: subscription } : stripeError(404, `No such subscription: '${id}'`);
}
