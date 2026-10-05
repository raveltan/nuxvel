import { z } from "zod";

const query = z.object({ to: z.email(), locale: z.string().optional() });

export default defineEventHandler(async (event) => {
  const { to, locale } = query.parse(getQuery(event));

  await sendMailNow($mails.welcome, { to, name: "Ada" }, locale ? { locale } : {});
});
