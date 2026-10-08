import { z } from "zod";
import { checkout } from "@nuxvel/nuxt/server/billing";
import { proProduct } from "#server/products/_pro.product";
import { courseProduct } from "#server/products/_course.product";

const products = { _pro: proProduct, _course: courseProduct };

const body = z.object({
  user: z.object({ id: z.string(), email: z.string() }),
  product: z.enum(["_pro", "_course"]),
  successUrl: z.string().default("/billing?session={CHECKOUT_SESSION_ID}"),
  cancelUrl: z.string().default("/pricing"),
});

export default defineEventHandler(async (event) => {
  const { user, product, successUrl, cancelUrl } = body.parse(await readBody(event));

  try {
    return { url: await checkout(user, products[product], { successUrl, cancelUrl }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});
