import { z } from "zod";
import { defineJob } from "../../jobs/define-job";
import { processBillingEvent } from "../process-event";

export default defineJob({
  input: z.object({ eventId: z.string().min(1) }),
  attempts: 10,
  backoff: { type: "exponential", delay: 30_000 },
  async handler({ eventId }) {
    await processBillingEvent(eventId);
  },
});
