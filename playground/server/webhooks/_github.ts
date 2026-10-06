import { z } from "zod";

export default defineWebhook({
  payload: z.object({ id: z.string(), type: z.string() }),
  verify: "github",
  handler: async ({ payload }) => {
    await $jobs._probe.webhookReceived.dispatch(payload);
  },
});
