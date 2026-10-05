import { z } from "zod";
import { healthChecksTable } from "../../database/schema/health-check.schema";

export const healthCheckNotifyOnUpdateJob = defineJob({
  input: z.object({ id: z.number().int().positive() }),
  handler: async ({ id }) => {
    const row = await findOrFail(healthChecksTable, id);

    useLogger("health-check").info("would notify the owner", { healthCheckId: row.id });
  },
});
