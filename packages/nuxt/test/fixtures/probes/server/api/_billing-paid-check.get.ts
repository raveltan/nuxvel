import { z } from "zod";
import { paid } from "@nuxvel/nuxt/server/billing";
import { proProduct } from "#server/products/_pro.product";
import { courseProduct } from "#server/products/_course.product";

const products = { _pro: proProduct, _course: courseProduct };

const query = z.object({ user: z.string(), product: z.enum(["_pro", "_course"]) });

export default defineEventHandler(async (event) => {
  const { user, product } = query.parse(getQuery(event));

  return { paid: await paid({ id: user }, products[product]) };
});
