import { envHint } from "../../shared/env/env-hints";
import Stripe from "stripe";
import { useRuntimeConfig } from "nitropack/runtime";
import { effectReplacement } from "../effects/replacements";

let client: { key: string; stripe: Stripe } | undefined;

function sendThroughFetch(...request: Parameters<typeof fetch>) {
  return (effectReplacement("stripeFetch") ?? globalThis.fetch)(...request);
}

/**
 * The app's Stripe client, created once and reused.
 *
 * Import it from `@nuxvel/nuxt/server/billing`, with `nuxvel.billing` on. It
 * is not auto-imported, so the types of Stripe load only in the files
 * that use it. Reads `NUXT_STRIPE_SECRET_KEY`. A failed request is retried twice with the
 * same idempotency key. Reach for it for a Stripe call that nuxvel's
 * billing helpers do not make. In a test build, every request goes to
 * nuxvel's in-memory Stripe and never reaches the network; `fakeFetch`
 * answers a request that it does not handle.
 *
 * Throws when `NUXT_STRIPE_SECRET_KEY` is not set.
 *
 * @example
 * ```ts
 * import { useStripe } from "@nuxvel/nuxt/server/billing";
 *
 * const invoices = await useStripe().invoices.list({ customer: customerId, limit: 10 });
 * ```
 */
export function useStripe(): Stripe {
  const key = useRuntimeConfig().stripeSecretKey;

  if (!key) throw new Error(`NUXT_STRIPE_SECRET_KEY is not set. ${envHint("NUXT_STRIPE_SECRET_KEY")}`);

  if (client && client.key === key) return client.stripe;

  const stripe = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(sendThroughFetch),
    maxNetworkRetries: 2,
    telemetry: false,
    appInfo: { name: "nuxvel" },
  });

  client = { key, stripe };

  return stripe;
}
