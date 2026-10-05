import { useRuntimeConfig } from "nitropack/runtime";
import { z } from "zod";
import { transaction } from "../../database/transaction";
import { defineWebhook } from "../../webhooks/define-webhook";
import { storeBillingEvent } from "../store-event";

function liveKey() {
  return /^(sk|rk)_live_/.test(useRuntimeConfig().stripeSecretKey);
}

const stripeEvent = z.object({
  id: z.string().startsWith("evt_"),
  type: z.string().min(1),
  created: z.number().int(),
  livemode: z.boolean().refine((livemode) => livemode === liveKey(), "The event's livemode does not match NUXT_STRIPE_SECRET_KEY"),
  data: z.object({ object: z.looseObject({ id: z.string().optional() }) }),
});

export default defineWebhook({
  payload: stripeEvent,
  verify: "stripe",
  eventId: ({ payload }) => payload.id,
  handler: async ({ payload }) => {
    await transaction(() => storeBillingEvent(payload));
  },
});
