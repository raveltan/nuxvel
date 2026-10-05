import { eq } from "drizzle-orm";
import { healthChecksTable } from "../../database/schema/health-check.schema";
import { updateHealthCheckInput } from "../../../shared/schemas/health-check";

export const updateHealthCheckAction = defineAction({
  input: updateHealthCheckInput,
  handler: async (input, ctx) => {
    const row = await findOrFail(healthChecksTable, input.id);
    await authorize(ctx.actor, "update", healthChecksTable, row);

    const updated = await useDb()
      .update(healthChecksTable)
      .set({ name: input.name })
      .where(eq(healthChecksTable.id, input.id))
      .returning()
      .then(firstOrFail);

    await dispatchAfterCommit("health-check.notify-on-update", { id: updated.id });

    return updated;
  },
});
