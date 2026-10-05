export default defineEventHandler(async (event) => {
  const { user } = await requireAuth();

  return sendRedirect(event, await billingPortal(user, { returnUrl: "/?portal=1" }), 303);
});
