import { eq } from "drizzle-orm";
import { z } from "zod";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

const created = probeNamed("_action-audit-check.created", defineAction({
  audit: "_action-audit-check.created",
  handler: () =>
    useDb()
      .insert(outboxTable)
      .values({ jobName: "_action-audit-check.before", payload: { tags: ["a"], at: { nested: true } }, dispatchedAt: new Date() })
      .returning()
      .then(firstOrFail),
}));

const renamed = probeNamed("_action-audit-check.renamed", defineAction({
  input: z.object({ id: z.number(), jobName: z.string() }),
  audit: { name: "_action-audit-check.renamed", target: outboxTable },
  handler: async ({ id, jobName }) => {
    await useDb().update(outboxTable).set({ jobName }).where(eq(outboxTable.id, id));
  },
}));

const failing = probeNamed("_action-audit-check.failing", defineAction({
  input: z.object({ id: z.number() }),
  audit: { name: "_action-audit-check.failing", target: outboxTable },
  handler: () => {
    throw new Error("boom");
  },
}));

export default defineEventHandler(async () => {
  const actor = systemActor("_action-audit-check");
  const row = await created({}, { actor });

  await renamed({ id: row.id, jobName: "_action-audit-check.after" }, { actor });
  await failing({ id: row.id }, { actor }).catch(() => undefined);

  return { id: row.id };
});
