import { z } from "zod";

const query = z.object({ to: z.email() });

export default defineEventHandler(async (event) => {
  const { to } = query.parse(getQuery(event));

  await transaction(async () => {
    await $mails.welcome.send({ to, name: "Ada" });
    throw new Error("probe rollback");
  }).catch(() => undefined);

  return { ok: true };
});
