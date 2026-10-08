import { z } from "zod";
import { payCheckoutSession } from "../../../../../src/runtime/server/testing/stripe/scenarios";
import { proProduct } from "#server/products/_pro.product";
import { checkout } from "@nuxvel/nuxt/server/billing";

const body = z.object({ user: z.object({ id: z.string(), email: z.string() }) });

export default defineEventHandler(async (event) => {
  const { user } = body.parse(await readBody(event));
  const url = await checkout(user, proProduct, { successUrl: "/", cancelUrl: "/" });

  return payCheckoutSession(new URL(url).pathname.split("/").at(-1) ?? "", false);
});
