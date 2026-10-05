import { eq } from "drizzle-orm";
import { now } from "../clock/now";
import type { NuxvelTx } from "../database/client";
import { emit } from "../events/emit";
import { useLogger } from "../logging/logger";
import { audit } from "../utils/audit";
import { useStripe } from "./use-stripe";
import { billingSubscriptionChangedEvent } from "./events/subscription-changed";
import { findProductByLookupKey, productStoredName } from "./products";
import { billingCustomersTable, billingSubscriptionsTable } from "./tables";

function stripeDate(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000) : null;
}

export async function syncSubscription(tx: NuxvelTx, subscriptionId: string) {
  const subscription = await useStripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const [customer] = await tx.select().from(billingCustomersTable).where(eq(billingCustomersTable.stripeCustomerId, customerId));

  if (!customer) {
    useLogger("billing").warn(`ignored the subscription ${subscriptionId}: its customer ${customerId} is not a user of the app`);
    return;
  }

  const claimedUser = subscription.metadata.nuxvel_user;

  if (claimedUser && claimedUser !== customer.userId) {
    throw new Error(`nuxvel: the subscription ${subscriptionId} names the user ${claimedUser}, but its customer belongs to ${customer.userId}`);
  }

  const [item] = subscription.items.data;
  const product = item?.price.lookup_key ? findProductByLookupKey(item.price.lookup_key) : undefined;

  if (!item || !product) {
    useLogger("billing").warn(`ignored the subscription ${subscriptionId}: its price has no lookup key of a product of the app`);
    return;
  }

  const [previous] = await tx.select().from(billingSubscriptionsTable).where(eq(billingSubscriptionsTable.id, subscriptionId));
  const row = {
    userId: customer.userId,
    product: productStoredName(product),
    priceId: item.price.id,
    status: subscription.status,
    quantity: item.quantity ?? 1,
    currentPeriodEnd: stripeDate(item.current_period_end),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    endedAt: stripeDate(subscription.ended_at),
    livemode: subscription.livemode,
  };

  await tx
    .insert(billingSubscriptionsTable)
    .values({ id: subscriptionId, ...row })
    .onConflictDoUpdate({ target: billingSubscriptionsTable.id, set: { ...row, updatedAt: now() } });

  const changed =
    !previous ||
    previous.status !== row.status ||
    previous.product !== row.product ||
    previous.cancelAtPeriodEnd !== row.cancelAtPeriodEnd ||
    previous.currentPeriodEnd?.getTime() !== row.currentPeriodEnd?.getTime();

  if (!changed) return;

  await audit("billing.subscription.changed", { type: "user", id: customer.userId }, {
    metadata: { subscriptionId, product: row.product, status: row.status, previousStatus: previous?.status ?? null },
  });
  await emit(billingSubscriptionChangedEvent, {
    userId: customer.userId,
    product: row.product,
    subscriptionId,
    status: row.status,
    previousStatus: previous?.status ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  });
}
