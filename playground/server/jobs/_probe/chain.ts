import { z } from "zod";
import recordJob from "#server/jobs/_probe/record";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await recordJob.dispatch({ name });
  },
});
