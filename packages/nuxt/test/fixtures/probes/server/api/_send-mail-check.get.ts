import { z } from "zod";
import { findJob } from "../../../../../src/runtime/server/jobs/registry";
import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { useQueue } from "@nuxvel/nuxt/server/queues";
import { welcomeMail } from "#server/mail/welcome.mail";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";
import { relayOutbox } from "@nuxvel/nuxt/server/queues";

const query = z.object({ rolledBack: z.email(), committed: z.email() });

export default defineEventHandler(async (event) => {
  const { rolledBack, committed } = query.parse(getQuery(event));

  await useQueue("mail").obliterate({ force: true });
  await useDb().delete(outboxTable);

  await transaction(async () => {
    await welcomeMail.send({ to: rolledBack, name: "Rolled Back" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  await transaction(async () => {
    await welcomeMail.send({ to: committed, name: "Ada" });
  });

  await relayOutbox();

  for (const job of await useQueue("mail").getWaiting()) {
    await findJob(job.name)?.run(job.data);
  }

  return { ok: true };
});
