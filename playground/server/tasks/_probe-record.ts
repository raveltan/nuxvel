import { healthChecksTable } from "#nuxvel/schema";

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
