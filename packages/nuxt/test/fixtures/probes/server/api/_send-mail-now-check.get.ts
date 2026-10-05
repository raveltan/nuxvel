import { z } from "zod";
import { outboxTable } from "~~/server/database/schema/outbox.schema";

const query = z.object({ to: z.email() });

export default defineEventHandler(async (event) => {
  const { to } = query.parse(getQuery(event));

  await useDb().delete(outboxTable);

  await transaction(async () => {
    await sendMailNow($mails.welcome, { to, name: "Grace" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  return { outboxRows: (await useDb().select().from(outboxTable)).length };
});
