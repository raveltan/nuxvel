import { z } from "zod";

export default defineWebhook({
  payload: z.object({ id: z.string(), type: z.string() }),
  verify: "stripe",
  eventId: ({ payload }) => payload.id,
  handler: async ({ payload }) => {
    await dispatchAfterCommit("_probe.webhook-received", payload);
  },
});
