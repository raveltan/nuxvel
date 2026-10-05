import { z } from "zod";

const query = z.object({ user: z.string(), product: z.enum(["_pro", "_course"]).optional() });

export default defineEventHandler(async (event) => {
  const { user, product } = query.parse(getQuery(event));

  return { subscribed: await subscribed({ id: user }, product ? $products[product] : undefined) };
});
