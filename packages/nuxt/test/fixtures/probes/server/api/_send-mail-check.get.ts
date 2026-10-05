import { z } from "zod";
import { findJob } from "../../../../../src/runtime/server/jobs/registry";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

const query = z.object({ rolledBack: z.email(), committed: z.email() });

export default defineEventHandler(async (event) => {
  const { rolledBack, committed } = query.parse(getQuery(event));

  await useQueue("mail").obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await sendMail("welcome", { to: rolledBack, name: "Rolled Back" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  await transaction(async () => {
    await sendMail("welcome", { to: committed, name: "Ada" });
  });

  await relayOutbox();

  for (const job of await useQueue("mail").getWaiting()) {
    await findJob(job.name)?.run(job.data);
  }

  return { ok: true };
});
