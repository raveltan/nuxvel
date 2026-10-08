import { z } from "zod";
import { requireAuth } from "@nuxvel/nuxt/server/auth";
import { checkout } from "@nuxvel/nuxt/server/billing";
import { proProduct } from "#server/products/_pro.product";
import { courseProduct } from "#server/products/_course.product";

const products = { _pro: proProduct, _course: courseProduct };

const query = z.object({ product: z.enum(["_pro", "_course"]) });

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth();
  const { product } = query.parse(getQuery(event));
  const url = await checkout(user, products[product], { successUrl: "/?paid={CHECKOUT_SESSION_ID}", cancelUrl: "/?canceled=1" });

  return sendRedirect(event, url, 303);
});
