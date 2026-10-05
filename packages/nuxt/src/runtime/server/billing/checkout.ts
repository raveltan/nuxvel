import { ConflictError } from "../errors/taxonomy";
import { useStripe } from "./use-stripe";
import { subscribed } from "./subscribed";
import { appUrl } from "./app-url";
import { type BillingUser, billingCustomerFor } from "./customer";
import type { Product } from "./define-product";
import { productStoredName } from "./products";

/** Where Stripe Checkout sends the user back to, for {@link checkout}. */
export interface CheckoutOptions {
  successUrl: string;
  cancelUrl: string;
}

async function activePrice(product: Product) {
  const { data } = await useStripe().prices.list({ lookup_keys: [product.lookupKey], active: true, limit: 1 });
  const [price] = data;

  if (!price) throw new Error(`nuxvel: no active Stripe price has the lookup key "${product.lookupKey}" of the product "${product.name}"`);

  if ((price.type === "recurring") !== (product.mode === "subscription")) {
    throw new Error(`nuxvel: the Stripe price "${product.lookupKey}" is ${price.type}, but the product "${product.name}" is a ${product.mode}`);
  }

  return price;
}

/**
 * Starts a Stripe Checkout for one product and returns the URL to send
 * the user to. Stripe asks for the card, then sends the user to
 * `successUrl`, or to `cancelUrl` when they go back.
 *
 * Auto-imported on the server when `nuxvel.billing` is on. The first
 * checkout of a user creates their Stripe customer, once, however many
 * requests race. The price is the active Stripe price with the product's
 * lookup key, so the amount never comes from the browser. Nothing is
 * granted here: access follows the Stripe webhook once Stripe says the
 * user paid. Throws `ConflictError` for a user who already has a
 * subscription to the product, so nobody pays twice. Throws when no
 * active price has the lookup key, or its
 * kind does not fit the product's mode, and when a URL points outside
 * the app.
 *
 * @param options.successUrl A path of the app, or a URL on its origin.
 * Stripe replaces `{CHECKOUT_SESSION_ID}` in it with the session ID.
 * @param options.cancelUrl A path of the app, or a URL on its origin.
 *
 * @example
 * ```ts
 * export const billingRouter = router({
 *   upgrade: authedProcedure.mutation(({ ctx }) =>
 *     checkout(ctx.user, $products.pro, { successUrl: "/billing?paid=1", cancelUrl: "/pricing" }),
 *   ),
 * });
 * ```
 */
export async function checkout(user: BillingUser, product: Product, options: CheckoutOptions): Promise<string> {
  const successUrl = appUrl(options.successUrl, "successUrl");
  const cancelUrl = appUrl(options.cancelUrl, "cancelUrl");

  if (product.mode === "subscription" && (await subscribed(user, product))) {
    throw new ConflictError(`This user already has a subscription to "${product.name}"`);
  }

  const customer = await billingCustomerFor(user);
  const price = await activePrice(product);
  const metadata = { nuxvel_user: user.id, nuxvel_product: productStoredName(product) };
  const session = await useStripe().checkout.sessions.create({
    mode: product.mode,
    customer: customer.stripeCustomerId,
    client_reference_id: user.id,
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    ...(product.mode === "subscription" ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
  });

  if (!session.url) throw new Error(`nuxvel: Stripe gave the Checkout session ${session.id} no URL`);

  return session.url;
}
