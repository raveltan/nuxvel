import { requireAuth } from "@nuxvel/nuxt/server/auth";
import { billingPortal } from "@nuxvel/nuxt/server/billing";

export default defineEventHandler(async (event) => {
  const { user } = await requireAuth();

  return sendRedirect(event, await billingPortal(user, { returnUrl: "/?portal=1" }), 303);
});
