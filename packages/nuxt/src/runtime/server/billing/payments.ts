import { eq } from "drizzle-orm";
import { now } from "../clock/now";
import type { NuxvelTx } from "../database/client";
import { emit } from "../events/emit";
import { useLogger } from "../logging/logger";
import { audit } from "../utils/audit";
import { useStripe } from "./use-stripe";
import { billingDisputedEvent } from "./events/disputed";
import { billingPaidEvent } from "./events/paid";
import { billingRefundedEvent } from "./events/refunded";
import { findProduct, productStoredName } from "./products";
import { billingCustomersTable, billingPaymentsTable } from "./tables";

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

export async function recordPayment(tx: NuxvelTx, sessionId: string) {
  const session = await useStripe().checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });

  if (session.mode !== "payment" || session.payment_status !== "paid") return;

  const customerId = idOf(session.customer);
  const [customer] = customerId
    ? await tx.select().from(billingCustomersTable).where(eq(billingCustomersTable.stripeCustomerId, customerId))
    : [];
  const product = findProduct(session.metadata?.nuxvel_product ?? "");

  if (!customer || !product) {
    useLogger("billing").warn(`ignored the Checkout session ${sessionId}: it was not started by checkout() of the app`);
    return;
  }

  if (session.client_reference_id !== customer.userId || session.metadata?.nuxvel_user !== customer.userId) {
    throw new Error(`nuxvel: the Checkout session ${sessionId} names another user than its customer ${customer.userId}`);
  }

  const [item, ...more] = session.line_items?.data ?? [];
  const price = item?.price;
  const paymentIntentId = idOf(session.payment_intent);

  if (!item || more.length > 0 || !price || price.lookup_key !== product.lookupKey || price.type !== "one_time") {
    throw new Error(`nuxvel: the Checkout session ${sessionId} does not hold the one price of the product "${product.name}"`);
  }

  if (price.unit_amount === null || session.amount_subtotal !== price.unit_amount * (item.quantity ?? 1) || session.currency !== price.currency) {
    throw new Error(`nuxvel: the Checkout session ${sessionId} charged ${session.amount_subtotal} ${session.currency}, not the price of "${product.name}"`);
  }

  if (!paymentIntentId || session.amount_total === null || !session.currency) {
    throw new Error(`nuxvel: the paid Checkout session ${sessionId} has no payment intent or amount`);
  }

  const payment = {
    checkoutSessionId: sessionId,
    paymentIntentId,
    userId: customer.userId,
    product: productStoredName(product),
    priceId: price.id,
    amount: session.amount_total,
    currency: session.currency,
    status: "paid",
    livemode: session.livemode,
    paidAt: now(),
  };
  const stored = await tx.insert(billingPaymentsTable).values(payment).onConflictDoNothing().returning({ id: billingPaymentsTable.checkoutSessionId });

  if (stored.length === 0) return;

  await audit("billing.payment.paid", { type: "user", id: customer.userId }, {
    metadata: { checkoutSessionId: sessionId, product: payment.product, amount: payment.amount, currency: payment.currency },
  });
  await emit(billingPaidEvent, {
    userId: customer.userId,
    product: payment.product,
    checkoutSessionId: sessionId,
    amount: payment.amount,
    currency: payment.currency,
  });
}

async function paymentFor(tx: NuxvelTx, paymentIntentId: string | undefined, about: string) {
  const [payment] = paymentIntentId
    ? await tx.select().from(billingPaymentsTable).where(eq(billingPaymentsTable.paymentIntentId, paymentIntentId)).for("update")
    : [];

  if (!payment) useLogger("billing").warn(`ignored ${about}: it is not about a one-time payment of the app`);

  return payment;
}

export async function syncRefund(tx: NuxvelTx, chargeId: string) {
  const charge = await useStripe().charges.retrieve(chargeId);
  const payment = await paymentFor(tx, idOf(charge.payment_intent), `the refund of the charge ${chargeId}`);

  if (!payment || charge.amount_refunded <= payment.amountRefunded) return;

  const fullyRefunded = charge.amount_refunded >= payment.amount;
  const status = payment.status === "disputed" ? "disputed" : fullyRefunded ? "refunded" : "partially_refunded";

  await tx
    .update(billingPaymentsTable)
    .set({ amountRefunded: charge.amount_refunded, status, updatedAt: now() })
    .where(eq(billingPaymentsTable.checkoutSessionId, payment.checkoutSessionId));
  await audit("billing.payment.refunded", { type: "user", id: payment.userId }, {
    metadata: { checkoutSessionId: payment.checkoutSessionId, amountRefunded: charge.amount_refunded, currency: payment.currency },
  });
  await emit(billingRefundedEvent, {
    userId: payment.userId,
    product: payment.product,
    checkoutSessionId: payment.checkoutSessionId,
    amountRefunded: charge.amount_refunded,
    fullyRefunded,
  });
}

export async function syncDispute(tx: NuxvelTx, disputeId: string) {
  const dispute = await useStripe().disputes.retrieve(disputeId);
  const payment = await paymentFor(tx, idOf(dispute.payment_intent), `the dispute ${disputeId}`);

  if (!payment || payment.status === "disputed") return;

  await tx
    .update(billingPaymentsTable)
    .set({ status: "disputed", updatedAt: now() })
    .where(eq(billingPaymentsTable.checkoutSessionId, payment.checkoutSessionId));
  await audit("billing.payment.disputed", { type: "user", id: payment.userId }, {
    metadata: { checkoutSessionId: payment.checkoutSessionId, disputeId, reason: dispute.reason },
  });
  await emit(billingDisputedEvent, {
    userId: payment.userId,
    product: payment.product,
    checkoutSessionId: payment.checkoutSessionId,
    reason: dispute.reason,
  });
}
