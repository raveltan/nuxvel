import { z } from "zod";
import { welcomeMail } from "#server/mail/welcome.mail";
import { suppressMail } from "@nuxvel/nuxt/server/mail";

const query = z.object({ to: z.email(), suppressed: z.enum(["yes", "no"]) });

export default defineEventHandler(async (event) => {
  const { to, suppressed } = query.parse(getQuery(event));

  if (suppressed === "yes") await suppressMail(to.toUpperCase(), "bounce");

  await welcomeMail.send({ to, name: "Ada" });

  return { ok: true };
});
