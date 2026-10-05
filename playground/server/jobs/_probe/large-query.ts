import { inArray } from "drizzle-orm";
import { z } from "zod";
import { healthChecksTable } from "../../database/schema/health-check.schema";

export default defineJob({
  input: z.object({ names: z.array(z.string()).min(1) }),
  handler: async ({ names }) => {
    await useDb().select().from(healthChecksTable).where(inArray(healthChecksTable.name, names));
  },
});
