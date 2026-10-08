import { z } from "zod";
import { healthChecksTable } from "#nuxvel/schema";
import { useAuth } from "@nuxvel/nuxt/server/auth";
import { useDb } from "@nuxvel/nuxt/server/database";
import { defineJob } from "@nuxvel/nuxt/server/queues";

export default defineJob({
  input: z.object({ name: z.string().min(1) }),
  handler: async ({ name }, { dispatcher }) => {
    const { user, actor } = await useAuth();

    await useDb()
      .insert(healthChecksTable)
      .values({ userId: user?.id, name: JSON.stringify({ name, actor, dispatcher }) });
  },
});
