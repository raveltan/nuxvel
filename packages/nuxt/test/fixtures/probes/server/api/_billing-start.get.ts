import { z } from "zod";

const query = z.object({ product: z.enum(["_pro", "_course"]) });

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth();
  const { product } = query.parse(getQuery(event));
  const url = await checkout(user, $products[product], { successUrl: "/?paid={CHECKOUT_SESSION_ID}", cancelUrl: "/?canceled=1" });

  return sendRedirect(event, url, 303);
});
