import { z } from "zod";
import { healthChecksTable } from "../../database/schema/health-check.schema";

export default defineJob({
  version: 2,
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
