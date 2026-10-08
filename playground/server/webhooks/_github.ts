import { z } from "zod";
import webhookReceivedJob from "#server/jobs/_probe/webhook-received";
import { defineWebhook } from "@nuxvel/nuxt/server/webhooks";

export default defineWebhook({
  payload: z.object({ id: z.string(), type: z.string() }),
  verify: "github",
  handler: async ({ payload }) => {
    await webhookReceivedJob.dispatch(payload);
  },
});
