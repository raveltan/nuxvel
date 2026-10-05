import { NotFoundError } from "../errors/taxonomy";
import { useStripe } from "./use-stripe";
import { appUrl } from "./app-url";
import { type BillingUser, findBillingCustomer } from "./customer";

/**
 * Opens the Stripe Customer Portal of a user and returns the URL to
 * send them to. There they change their card, see their invoices and
 * cancel a subscription. Stripe sends them back to `returnUrl`.
 *
 * Auto-imported on the server when `nuxvel.billing` is on. Throws
 * `NotFoundError` for a user who never went through {@link checkout}, and
 * an error when `returnUrl` points outside the app.
 *
 * @param options.returnUrl A path of the app, or a URL on its origin.
 *
 * @example
 * ```ts
 * manage: authedProcedure.mutation(({ ctx }) => billingPortal(ctx.user, { returnUrl: "/billing" })),
 * ```
 */
export async function billingPortal(user: BillingUser, options: { returnUrl: string }): Promise<string> {
  const returnUrl = appUrl(options.returnUrl, "returnUrl");
  const customer = await findBillingCustomer(user.id);

  if (!customer) throw new NotFoundError("This user has no billing account yet");

  const session = await useStripe().billingPortal.sessions.create({ customer: customer.stripeCustomerId, return_url: returnUrl });

  return session.url;
}
