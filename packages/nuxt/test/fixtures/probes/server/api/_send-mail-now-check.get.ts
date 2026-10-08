import { z } from "zod";
import { outboxTable } from "~~/server/database/schema/outbox.schema";
import { welcomeMail } from "#server/mail/welcome.mail";
import { transaction, useDb } from "@nuxvel/nuxt/server/database";
import { sendMailNow } from "@nuxvel/nuxt/server/mail";

const query = z.object({ to: z.email() });

export default defineEventHandler(async (event) => {
  const { to } = query.parse(getQuery(event));

  await useDb().delete(outboxTable);

  await transaction(async () => {
    await sendMailNow(welcomeMail, { to, name: "Grace" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  return { outboxRows: (await useDb().select().from(outboxTable)).length };
});
