import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";

export default defineJob({
  input: z.object({ url: z.string().url(), name: z.string().min(1) }),
  handler: async ({ url, name }) => {
    const reply = await $fetch<{ status: string }>(url, { method: "POST", body: { name } });

    await useDb().insert(healthChecksTable).values({ name: `${name}:${reply.status}` });
  },
});
