import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";
import { findOrFail } from "@nuxvel/nuxt/server/database";
import { useLogger } from "@nuxvel/nuxt/server/observability";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export const healthCheckNotifyOnUpdateJob = defineJob({
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }) => {
    const row = await findOrFail(healthChecksTable, id);

    useLogger("health-check").info("would notify the owner", { healthCheckId: row.id });
  },
});
