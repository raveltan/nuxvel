import { now } from "../clock/now";
import { transaction } from "../database/transaction";
import { useLogger } from "../logging/logger";
import { useStripe } from "./use-stripe";
import { HANDLED_EVENT_TYPES, storeBillingEvent } from "./store-event";

const STRIPE_EVENT_RETENTION_SECONDS = 30 * 86_400;

export async function reconcileBillingEvents(): Promise<number> {
  const since = Math.floor(now().getTime() / 1000) - STRIPE_EVENT_RETENTION_SECONDS;
  let stored = 0;

  for await (const event of useStripe().events.list({ created: { gte: since }, types: HANDLED_EVENT_TYPES, limit: 100 })) {
    if (await transaction(() => storeBillingEvent(event))) stored += 1;
  }

  if (stored > 0) useLogger("billing").warn(`stored ${stored} Stripe events that the webhook missed`);

  return stored;
}
