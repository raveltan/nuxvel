import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";
import { useDb } from "@nuxvel/nuxt/server/database";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export const namedExportJob = defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
