import { z } from "zod";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

const actionB = probeNamed("_nested-action-savepoint-check.actionB", defineAction({
  input: z.object({}),
  handler: async () => {
    await useDb().insert(healthChecksTable).values({});
    throw new Error("action B boom");
  },
}));

const actionACatchesB = probeNamed("_nested-action-savepoint-check.actionACatchesB", defineAction({
  input: z.object({}),
  handler: async (_input, ctx) => {
    await useDb().insert(healthChecksTable).values({});
    try {
      await actionB({}, ctx);
    } catch {}
  },
}));

const actionAPropagatesB = probeNamed("_nested-action-savepoint-check.actionAPropagatesB", defineAction({
  input: z.object({}),
  handler: async (_input, ctx) => {
    await useDb().insert(healthChecksTable).values({});
    await actionB({}, ctx);
  },
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_nested-action-savepoint-check");

  const before = await useDb().select().from(healthChecksTable);

  await actionACatchesB({}, { actor });
  const afterCaught = await useDb().select().from(healthChecksTable);

  try {
    await actionAPropagatesB({}, { actor });
  } catch {}
  const afterPropagated = await useDb().select().from(healthChecksTable);

  return {
    rowsAddedWhenCaught: afterCaught.length - before.length,
    rowsAddedWhenPropagated: afterPropagated.length - afterCaught.length,
  };
});
