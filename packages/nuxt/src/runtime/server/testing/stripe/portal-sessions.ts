import { type StripeReply, findStripeObject, nextStripeId, saveStripeObject, stripeError, stripeTimestamp } from "./state";
import { type FormValue, formText } from "./form";
import { TEST_CONTROL_PATH } from "../control-path";

export function createPortalSession(params: Record<string, FormValue>): StripeReply {
  const customer = formText(params, "customer");

  const returnUrl = formText(params, "return_url");

  if (!customer || findStripeObject(customer)?.object !== "customer") return stripeError(400, `No such customer: '${customer}'`);
  if (!returnUrl) return stripeError(400, "Missing required param: return_url.", "parameter_missing");

  const id = nextStripeId("bps");
  const session = saveStripeObject({
    id,
    object: "billing_portal.session",
    customer,
    return_url: returnUrl,
    url: `${new URL(returnUrl).origin}${TEST_CONTROL_PATH}/stripe/portal/${id}`,
    created: stripeTimestamp(),
    livemode: false,
  });

  return { status: 200, body: session };
}
