import { z } from "zod";
import webhookReceivedJob from "#server/jobs/_probe/webhook-received";
import { defineWebhook, hmac } from "@nuxvel/nuxt/server/webhooks";

const probeEvent = z.object({
  id: z.string(),
  type: z.string().refine(async (type) => type !== "probe.refused", "This event type is refused"),
});

export default defineWebhook({
  payload: probeEvent,
  verify: hmac({ header: "x-probe-signature", secret: "NUXT_PROBE_WEBHOOK_SECRET" }),
  eventId: ({ payload }) => payload.id,
  handler: async ({ payload: event }) => {
    await webhookReceivedJob.dispatch(event);

    if (event.type === "probe.slow-failing") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (event.type === "probe.failing" || event.type === "probe.slow-failing") {
      throw new Error("probe webhook handler failed");
    }
  },
});
