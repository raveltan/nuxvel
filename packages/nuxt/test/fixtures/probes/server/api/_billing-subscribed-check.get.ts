import { z } from "zod";
import { subscribed } from "@nuxvel/nuxt/server/billing";
import { proProduct } from "#server/products/_pro.product";
import { courseProduct } from "#server/products/_course.product";

const products = { _pro: proProduct, _course: courseProduct };

const query = z.object({ user: z.string(), product: z.enum(["_pro", "_course"]).optional() });

export default defineEventHandler(async (event) => {
  const { user, product } = query.parse(getQuery(event));

  return { subscribed: await subscribed({ id: user }, product ? products[product] : undefined) };
});
