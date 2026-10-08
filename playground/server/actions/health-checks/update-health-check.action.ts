import { healthChecksTable } from "#nuxvel/schema";
import { healthCheckNotifyOnUpdateJob } from "#server/jobs/health-check/notify-on-update.job";
import { healthCheckSchema, updateHealthCheckInput } from "#shared/schemas/health-check";
import { defineAction } from "@nuxvel/nuxt/server/actions";
import { findAuthorized } from "@nuxvel/nuxt/server/authorization";
import { updateOne } from "@nuxvel/nuxt/server/database";

export const updateHealthCheckAction = defineAction({
  input: updateHealthCheckInput,
  procedure: "authed",
  output: healthCheckSchema,
  audit: { name: "health-checks.update", target: healthChecksTable },
  handler: async (input) => {
    await findAuthorized(healthChecksTable, input.id, "update");

    const updated = await updateOne(healthChecksTable, input.id, { name: input.name });

    await healthCheckNotifyOnUpdateJob.dispatch({ id: updated.id });

    return updated;
  },
});
