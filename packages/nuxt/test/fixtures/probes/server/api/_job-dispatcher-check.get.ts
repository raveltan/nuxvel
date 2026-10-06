import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { t } from "../../../../../src/runtime/server/trpc/trpc";
import { userTable } from "~~/server/database/schema/auth.schema";
import { healthChecksTable } from "~~/server/database/schema/health-check.schema";
import { outboxTable } from "~~/server/database/schema/outbox.schema";
import whoami from "~~/server/jobs/_probe/whoami";

const dispatchWhoami = probeNamed("_job-dispatcher-check.dispatch", defineAction({
  input: z.object({ name: z.string() }),
  handler: ({ name }) => $jobs._probe.whoami.dispatch({ name }),
}));

const testRouter = t.router({
  fromProcedure: authedProcedure.mutation(() => $jobs._probe.whoami.dispatch({ name: "procedure" })),
  overridden: authedProcedure.mutation(() =>
    $jobs._probe.whoami.dispatch({ name: "overridden" }, { dispatcher: systemActor("_job-dispatcher-check") }),
  ),
  cleared: authedProcedure.mutation(() => $jobs._probe.whoami.dispatch({ name: "cleared" }, { dispatcher: null })),
});

export default defineEventHandler(async () => {
  await useDb().delete(outboxTable).where(eq(outboxTable.jobName, "_probe.whoami"));

  const user = await useDb()
    .insert(userTable)
    .values({ id: randomUUID(), name: "Job Dispatcher User", email: `${randomUUID()}@example.com` })
    .returning()
    .then(firstOrFail);
  const signedIn = testRouter.createCaller({ user });

  await signedIn.fromProcedure();
  await dispatchWhoami({ name: "action" }, { actor: userActor(user) });
  await signedIn.overridden();
  await signedIn.cleared();
  await $jobs._probe.whoami.dispatch({ name: "signed-out" });

  const rows = await useDb().select().from(outboxTable).where(eq(outboxTable.jobName, "_probe.whoami")).orderBy(outboxTable.id);

  for (const row of rows) await whoami.run(row.payload);

  const runs = await useDb().select().from(healthChecksTable).orderBy(healthChecksTable.id);

  return {
    userId: user.id,
    stored: rows.map((row) => row.payload),
    runs: runs.map((run) => ({ userId: run.userId, ...JSON.parse(run.name) })),
  };
});
