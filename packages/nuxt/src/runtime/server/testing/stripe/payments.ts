import { type StripeObject, type StripeReply, findStripeObject, nextStripeId, saveStripeObject, stripeError, stripeTimestamp } from "./state";

export function createPayment(session: StripeObject): { paymentIntent: StripeObject; charge: StripeObject } {
  const amount = Number(session.amount_total);
  const chargeId = nextStripeId("ch");
  const paymentIntent = saveStripeObject({
    id: nextStripeId("pi"),
    object: "payment_intent",
    amount,
    amount_received: amount,
    currency: session.currency,
    customer: session.customer,
    status: "succeeded",
    latest_charge: chargeId,
    metadata: typeof session.payment_intent_data === "object" && session.payment_intent_data !== null && "metadata" in session.payment_intent_data ? session.payment_intent_data.metadata : {},
    created: stripeTimestamp(),
    livemode: false,
  });
  const charge = saveStripeObject({
    id: chargeId,
    object: "charge",
    amount,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    currency: session.currency,
    customer: session.customer,
    payment_intent: paymentIntent.id,
    status: "succeeded",
    created: stripeTimestamp(),
    livemode: false,
  });

  return { paymentIntent, charge };
}

export function chargeOf(paymentIntentId: string): StripeObject {
  const paymentIntent = findStripeObject(paymentIntentId);
  const charge = paymentIntent ? findStripeObject(String(paymentIntent.latest_charge)) : undefined;

  if (!charge) throw new Error(`The in-memory payment intent ${paymentIntentId} has no charge`);

  return charge;
}

export function refundCharge(charge: StripeObject, amount?: number): StripeObject {
  const total = Number(charge.amount);
  const refunded = Math.min(total, Number(charge.amount_refunded) + (amount ?? total - Number(charge.amount_refunded)));

  return saveStripeObject({ ...charge, amount_refunded: refunded, refunded: refunded >= total });
}

export function disputeCharge(charge: StripeObject, reason: string): StripeObject {
  saveStripeObject({ ...charge, disputed: true });

  return saveStripeObject({
    id: nextStripeId("dp"),
    object: "dispute",
    amount: charge.amount,
    currency: charge.currency,
    charge: charge.id,
    payment_intent: charge.payment_intent,
    reason,
    status: "needs_response",
    created: stripeTimestamp(),
    livemode: false,
  });
}

function retrieveAs(type: string, id: string): StripeReply {
  const found = findStripeObject(id);

  return found?.object === type ? { status: 200, body: found } : stripeError(404, `No such ${type}: '${id}'`);
}

export const retrievePaymentIntent = (id: string) => retrieveAs("payment_intent", id);
export const retrieveCharge = (id: string) => retrieveAs("charge", id);
export const retrieveDispute = (id: string) => retrieveAs("dispute", id);
