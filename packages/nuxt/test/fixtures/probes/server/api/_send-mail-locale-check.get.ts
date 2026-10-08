import { z } from "zod";
import { welcomeMail } from "#server/mail/welcome.mail";
import { sendMailNow } from "@nuxvel/nuxt/server/mail";

const query = z.object({ to: z.email(), locale: z.string().optional() });

export default defineEventHandler(async (event) => {
  const { to, locale } = query.parse(getQuery(event));

  await sendMailNow(welcomeMail, { to, name: "Ada" }, locale ? { locale } : {});
});
