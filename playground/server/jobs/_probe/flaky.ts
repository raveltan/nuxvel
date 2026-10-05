import { eq } from "drizzle-orm";
import { z } from "zod";
import { healthChecksTable } from "../../database/schema/health-check.schema";

export default defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });

    const attempts = await useDb()
      .select()
      .from(healthChecksTable)
      .where(eq(healthChecksTable.name, name));

    if (attempts.length < 2) throw new Error("probe.flaky needs another go");
  },
});
