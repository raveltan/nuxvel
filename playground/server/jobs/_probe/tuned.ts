import { z } from "zod";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  attempts: 5,
  backoff: { seconds: 0.0103 },
  unique: ({ name }) => name,
  input: z.object({ name: z.string().min(1) }),
  handler: () => {},
});
