import { type StripeReply, findStripeObject, nextStripeId, saveStripeObject, stripeError, stripeTimestamp } from "./state";
import { type FormValue, formRecord, formText } from "./form";

export function createCustomer(params: Record<string, FormValue>): StripeReply {
  const customer = saveStripeObject({
    id: nextStripeId("cus"),
    object: "customer",
    email: formText(params, "email") ?? null,
    metadata: formRecord(params, "metadata"),
    created: stripeTimestamp(),
    livemode: false,
  });

  return { status: 200, body: customer };
}

export function retrieveCustomer(id: string): StripeReply {
  const customer = findStripeObject(id);

  return customer?.object === "customer" ? { status: 200, body: customer } : stripeError(404, `No such customer: '${id}'`);
}
