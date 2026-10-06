import { healthChecksTable } from "#nuxvel/schema";

export const updateHealthCheckAction = defineAction({
  input: updateHealthCheckInput,
  procedure: "authed",
  output: healthCheckSchema,
  audit: { name: "health-checks.update", target: healthChecksTable },
  handler: async (input) => {
    await findAuthorized(healthChecksTable, input.id, "update");

    const updated = await updateOne(healthChecksTable, input.id, { name: input.name });

    await $jobs.healthCheck.notifyOnUpdate.dispatch({ id: updated.id });

    return updated;
  },
});
