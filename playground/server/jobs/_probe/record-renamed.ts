import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";

const v1 = z.object({ label: z.string().min(1) });

export default defineJob({
  version: 2,
  upcasters: {
    1: (payload) => ({ name: v1.parse(payload).label }),
  },
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }) => {
    await useDb().insert(healthChecksTable).values({ name });
  },
});
