import { z } from "zod";
import { welcomeMail } from "#server/mail/welcome.mail";
import { transaction } from "@nuxvel/nuxt/server/database";

const query = z.object({ to: z.email() });

export default defineEventHandler(async (event) => {
  const { to } = query.parse(getQuery(event));

  await transaction(async () => {
    await welcomeMail.send({ to, name: "Ada" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  return { ok: true };
});
