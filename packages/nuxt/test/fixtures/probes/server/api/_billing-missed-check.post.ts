import { z } from "zod";
import { payCheckoutSession } from "../../../../../src/runtime/server/testing/stripe/scenarios";

const body = z.object({ user: z.object({ id: z.string(), email: z.string() }) });

export default defineEventHandler(async (event) => {
  const { user } = body.parse(await readBody(event));
  const url = await checkout(user, $products._pro, { successUrl: "/", cancelUrl: "/" });

  return payCheckoutSession(new URL(url).pathname.split("/").at(-1) ?? "", false);
});
