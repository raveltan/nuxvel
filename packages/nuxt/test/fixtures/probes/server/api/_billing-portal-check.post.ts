import { z } from "zod";

const body = z.object({ user: z.object({ id: z.string(), email: z.string() }), returnUrl: z.string().default("/billing") });

export default defineEventHandler(async (event) => {
  const { user, returnUrl } = body.parse(await readBody(event));

  return { url: await billingPortal(user, { returnUrl }) };
});
