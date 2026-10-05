import { z } from "zod";
import { healthChecksTable } from "../../database/schema/health-check.schema";

export default defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }, { dispatcher }) => {
    const { user, actor } = await useAuth();

    await useDb()
      .insert(healthChecksTable)
      .values({ userId: user?.id, name: JSON.stringify({ name, actor, dispatcher }) });
  },
});
