import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";

export default defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    while (!(await useRedis("cache").get(`_probe.held:${name}`))) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    await useDb().insert(healthChecksTable).values({ name });
  },
});
