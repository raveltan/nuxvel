import { z } from "zod";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  input: z.object({ id: z.string(), type: z.string() }),
  handler: () => {},
});
