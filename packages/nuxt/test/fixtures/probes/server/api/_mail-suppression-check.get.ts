import { z } from "zod";

const query = z.object({ to: z.email(), suppressed: z.enum(["yes", "no"]) });

export default defineEventHandler(async (event) => {
  const { to, suppressed } = query.parse(getQuery(event));

  if (suppressed === "yes") await suppressMail(to.toUpperCase(), "bounce");

  await $mails.welcome.send({ to, name: "Ada" });

  return { ok: true };
});
