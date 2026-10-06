import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";

export const namedExportJob = defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
