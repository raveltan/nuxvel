import type { EnvProblem } from "./check-environment";
import { envHint } from "./env-hints";

const LIVE_KEY = /^(sk|rk)_live_/;
const SECRET_KEY = /^(sk|rk)_(live|test)_/;

function problem(variable: string, text: string, unset: boolean): EnvProblem {
  return {
    variable,
    problem: text,
    message: unset ? `${variable} is not set` : `${variable}: ${text}`,
    hint: envHint(variable),
  };
}

/**
 * Checks the Stripe settings that `nuxvel.billing` needs, the check a
 * nuxvel server with billing on runs at boot and `nuxvel doctor` runs
 * too. In production, `NUXT_STRIPE_SECRET_KEY` and
 * `NUXT_STRIPE_WEBHOOK_SECRET` are required. The key must be a secret
 * or restricted key (`sk_` or `rk_`), never the publishable `pk_` one.
 * Outside production, and in a build for `nuxt dev` or for tests, a
 * live key is refused, so a development machine or a test never takes
 * a real payment.
 *
 * @param settings - the variables by name, usually `environmentSettings()`'s result.
 * @param options.production - whether `NODE_ENV` is `production`.
 * @param options.testKeysOnly - whether the build is for `nuxt dev` or
 * for tests, `runtimeConfig.stripeTestKeysOnly`.
 *
 * @example
 * import { checkBillingEnvironment, environmentSettings } from "@nuxvel/nuxt/env";
 *
 * const problems = checkBillingEnvironment(environmentSettings(process.env, runtimeConfig), {
 *   production: process.env.NODE_ENV === "production",
 *   testKeysOnly: false,
 * });
 */
export function checkBillingEnvironment(
  settings: Record<string, string | undefined>,
  { production, testKeysOnly }: { production: boolean; testKeysOnly: boolean },
): EnvProblem[] {
  const key = settings.NUXT_STRIPE_SECRET_KEY ?? "";
  const webhookSecret = settings.NUXT_STRIPE_WEBHOOK_SECRET ?? "";

  return [
    ...(production && !key ? [problem("NUXT_STRIPE_SECRET_KEY", "Required in production", true)] : []),
    ...(key && !SECRET_KEY.test(key) ? [problem("NUXT_STRIPE_SECRET_KEY", "Not a Stripe secret key", false)] : []),
    ...((!production || testKeysOnly) && LIVE_KEY.test(key) ? [problem("NUXT_STRIPE_SECRET_KEY", "A live key outside production", false)] : []),
    ...(production && !webhookSecret ? [problem("NUXT_STRIPE_WEBHOOK_SECRET", "Required in production", true)] : []),
  ];
}
