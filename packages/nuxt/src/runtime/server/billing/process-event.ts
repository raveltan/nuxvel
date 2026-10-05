import { eq, sql } from "drizzle-orm";
import { now } from "../clock/now";
import { useDb } from "../database/client";
import { transaction } from "../database/transaction";
import type { NuxvelTx } from "../database/client";
import { actorContext } from "../actions/context";
import { systemActor } from "../actions/system-actor";
import { useStripe } from "./use-stripe";
import { syncSubscription } from "./sync-subscription";
import { recordPayment, syncDispute, syncRefund } from "./payments";
import { billingEventsTable } from "./tables";
import { errorMessage } from "../errors/error-message";

async function recordFailure(eventId: string, error: unknown) {
  await useDb({ root: true })
    .update(billingEventsTable)
    .set({ attempts: sql`${billingEventsTable.attempts} + 1`, lastError: errorMessage(error) })
    .where(eq(billingEventsTable.id, eventId));
}

async function handleCheckout(tx: NuxvelTx, sessionId: string) {
  const session = await useStripe().checkout.sessions.retrieve(sessionId);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

  if (session.mode === "subscription" && subscriptionId) await syncSubscription(tx, subscriptionId);
  if (session.mode === "payment") await recordPayment(tx, sessionId);
}

async function handleEvent(tx: NuxvelTx, type: string, objectId: string) {
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") await handleCheckout(tx, objectId);
  else if (type.startsWith("customer.subscription.")) await syncSubscription(tx, objectId);
  else if (type === "charge.refunded") await syncRefund(tx, objectId);
  else if (type === "charge.dispute.created") await syncDispute(tx, objectId);
}

export async function processBillingEvent(eventId: string) {
  try {
    await transaction(async (tx) => {
      const [event] = await tx.select().from(billingEventsTable).where(eq(billingEventsTable.id, eventId)).for("update");

      if (!event || event.processedAt) return;

      if (event.objectId) {
        const objectId = event.objectId;

        await actorContext.run(systemActor("stripe"), () => handleEvent(tx, event.type, objectId));
      }

      await tx
        .update(billingEventsTable)
        .set({ processedAt: now(), attempts: sql`${billingEventsTable.attempts} + 1`, lastError: null })
        .where(eq(billingEventsTable.id, eventId));
    });
  } catch (error) {
    await recordFailure(eventId, error);
    throw error;
  }
}
