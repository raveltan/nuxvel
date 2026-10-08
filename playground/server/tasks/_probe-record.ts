import { healthChecksTable } from "#nuxvel/schema";
import { useDb } from "@nuxvel/nuxt/server/database";

export default defineTask({
  meta: {
    name: "_probe-record",
    description: "Write a health check row so a test can see the task ran.",
  },
  run: async ({ payload }) => {
    const name = String(payload.name ?? "probe-task");

    await useDb().insert(healthChecksTable).values({ name });

    return { result: name };
  },
});
