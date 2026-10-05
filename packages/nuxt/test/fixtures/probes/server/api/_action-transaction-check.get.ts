import { z } from "zod";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";

const transactional = probeNamed("_action-transaction-check.transactional", defineAction({
  input: z.object({}),
  handler: async () => {
    await useDb().insert(healthChecksTable).values({});
    throw new Error("boom");
  },
}));

const nonTransactional = probeNamed("_action-transaction-check.nonTransactional", defineAction({
  input: z.object({}),
  handler: async () => {
    await useDb().insert(healthChecksTable).values({});
    throw new Error("boom");
  },
  transaction: false,
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_action-transaction-check");

  const before = await useDb().select().from(healthChecksTable);

  try {
    await transactional({}, { actor });
  } catch {}

  const afterTransactional = await useDb().select().from(healthChecksTable);

  try {
    await nonTransactional({}, { actor });
  } catch {}

  const afterNonTransactional = await useDb().select().from(healthChecksTable);

  return {
    transactionalRowAdded: afterTransactional.length > before.length,
    nonTransactionalRowAdded: afterNonTransactional.length > afterTransactional.length,
  };
});
