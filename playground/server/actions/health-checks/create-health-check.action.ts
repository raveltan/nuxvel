import { healthChecksTable } from "#nuxvel/schema";

export const createHealthCheckAction = defineAction({
  input: createHealthCheckInput,
  handler: async (input, ctx) => {
    const row = await useDb()
      .insert(healthChecksTable)
      .values({ userId: ctx.actor.id })
      .returning()
      .then(firstOrFail);
    return row;
  },
});
