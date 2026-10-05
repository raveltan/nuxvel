import { z } from "zod";

const query = z.object({ user: z.string(), product: z.enum(["_pro", "_course"]) });

export default defineEventHandler(async (event) => {
  const { user, product } = query.parse(getQuery(event));

  return { paid: await paid({ id: user }, $products[product]) };
});
