import { type StripeReply, findStripeObject, nextStripeId, saveStripeObject, stripeError, stripeTimestamp } from "./state";
import { type FormValue, formRecord, formText } from "./form";
import { fakePrice } from "./prices";
import { TEST_CONTROL_PATH } from "../control-path";

export function createCheckoutSession(params: Record<string, FormValue>): StripeReply {
  const mode = formText(params, "mode");
  const customer = formText(params, "customer");
  const priceId = formText(params, "line_items", 0, "price");
  const quantity = Number(formText(params, "line_items", 0, "quantity") ?? "1");
  const price = priceId ? fakePrice(priceId) : undefined;

  if (mode !== "subscription" && mode !== "payment") return stripeError(400, "Invalid mode", "parameter_invalid_empty");
  const successUrl = formText(params, "success_url");

  if (!successUrl) return stripeError(400, "Missing required param: success_url.", "parameter_missing");
  if (!customer || findStripeObject(customer)?.object !== "customer") return stripeError(400, `No such customer: '${customer}'`);
  if (!price) return stripeError(400, `No such price: '${priceId}'`);
  if ((price.type === "recurring") !== (mode === "subscription")) {
    return stripeError(400, `The price ${String(price.id)} does not fit mode ${mode}.`, "parameter_invalid");
  }

  const id = nextStripeId("cs");
  const session = saveStripeObject({
    id,
    object: "checkout.session",
    mode,
    customer,
    client_reference_id: formText(params, "client_reference_id") ?? null,
    metadata: formRecord(params, "metadata"),
    subscription_data: { metadata: formRecord(params, "subscription_data", "metadata") },
    payment_intent_data: { metadata: formRecord(params, "payment_intent_data", "metadata") },
    line_items: {
      object: "list",
      data: [{ id: nextStripeId("li"), object: "item", price, quantity, amount_subtotal: Number(price.unit_amount) * quantity, currency: price.currency }],
    },
    amount_subtotal: Number(price.unit_amount) * quantity,
    amount_total: Number(price.unit_amount) * quantity,
    currency: price.currency,
    success_url: formText(params, "success_url"),
    cancel_url: formText(params, "cancel_url") ?? null,
    status: "open",
    payment_status: "unpaid",
    payment_intent: null,
    subscription: null,
    url: `${new URL(successUrl).origin}${TEST_CONTROL_PATH}/stripe/checkout/${id}`,
    created: stripeTimestamp(),
    livemode: false,
  });

  return { status: 200, body: session };
}

export function retrieveCheckoutSession(id: string): StripeReply {
  const session = findStripeObject(id);

  return session?.object === "checkout.session" ? { status: 200, body: session } : stripeError(404, `No such checkout.session: '${id}'`);
}
