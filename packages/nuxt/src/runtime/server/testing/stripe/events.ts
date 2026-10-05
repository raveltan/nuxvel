import { type StripeObject, type StripeReply, nextStripeId, saveStripeObject, stripeList, stripeObjectsOf, stripeTimestamp } from "./state";
import { type FormValue, formList, formText } from "./form";

export function recordStripeEvent(type: string, object: StripeObject): StripeObject {
  return saveStripeObject({
    id: nextStripeId("evt"),
    object: "event",
    type,
    created: stripeTimestamp(),
    livemode: false,
    data: { object: structuredClone(object) },
  });
}

export function listStripeEvents(params: Record<string, FormValue>): StripeReply {
  const since = Number(formText(params, "created", "gte") ?? "0");
  const types = formList(params, "types").filter((type): type is string => typeof type === "string");
  const events = stripeObjectsOf("event")
    .filter((event) => Number(event.created) >= since && (types.length === 0 || types.includes(String(event.type))))
    .reverse();

  return stripeList(events, "/v1/events");
}
