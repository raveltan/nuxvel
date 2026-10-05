import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "../../../../../src/runtime/server/trpc/trpc";
import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { userTable } from "~~/server/database/schema/auth.schema";

const testRouter = t.router({
  rename: authedProcedure
    .input(z.object({ id: z.number(), jobName: z.string() }))
    .use(audited("_audited-check.renamed", { target: outboxTable }))
    .mutation(({ input }) =>
      useDb().update(outboxTable).set({ jobName: input.jobName }).where(eq(outboxTable.id, input.id)),
    ),
});

export default defineEventHandler(async () => {
  const owner = await useDb()
    .insert(userTable)
    .values({
      id: randomUUID(),
      name: "Audited Owner",
      email: `${randomUUID()}@example.com`,
    })
    .returning()
    .then(firstOrFail);

  const dispatched = await useDb()
    .insert(outboxTable)
    .values({
      jobName: "_audited-check.before",
      payload: { tags: ["a"], at: { nested: true } },
      dispatchedAt: new Date(),
    })
    .returning()
    .then(firstOrFail);

  await testRouter
    .createCaller({ user: owner })
    .rename({ id: dispatched.id, jobName: "_audited-check.after" });

  return { renamedId: dispatched.id };
});
