import { useDb } from "../database/client";
import processBillingEventJob from "./jobs/process-billing-event";
import { billingEventsTable } from "./tables";

export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "charge.refunded",
  "charge.dispute.created",
];

interface StripeEventHeader {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  data: { object: object };
}

function objectId(object: object) {
  return "id" in object && typeof object.id === "string" ? object.id : null;
}

export async function storeBillingEvent(event: StripeEventHeader): Promise<boolean> {
  const stored = await useDb()
    .insert(billingEventsTable)
    .values({
      id: event.id,
      type: event.type,
      objectId: objectId(event.data.object),
      livemode: event.livemode,
      stripeCreatedAt: new Date(event.created * 1000),
    })
    .onConflictDoNothing({ target: billingEventsTable.id })
    .returning({ id: billingEventsTable.id });

  if (stored.length === 0) return false;

  await processBillingEventJob.dispatch({ eventId: event.id });

  return true;
}
