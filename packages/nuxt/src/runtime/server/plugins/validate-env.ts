import uploads from "#nuxvel/uploads";
import { defineNitroPlugin, useRuntimeConfig } from "nitropack/runtime";
import { checkEnvironment, environmentSettings } from "../../shared/env/check-environment";
import { checkBillingEnvironment } from "../../shared/env/check-billing-environment";
import type { AuthRuntimeConfig, SocialProviderId } from "../../shared/auth/social-provider-id";
import { envHint } from "../../shared/env/env-hints";
import { useLogger } from "../logging/logger";
import { useNuxvelConfig } from "../utils/config";

interface BootProblem {
  variable: string;
  problem: string;
  hint: string;
}

function missingForDefinitions(settings: Record<string, string | undefined>): BootProblem[] {
  if (process.env.NODE_ENV !== "production") return [];

  const required = [
    ...(useRuntimeConfig().ogImageSecretRequired ? ["NUXT_OG_IMAGE_SECRET"] : []),
    ...(uploads.length > 0 ? ["NUXT_STORAGE_URL", "NUXT_STORAGE_BUCKET"] : []),
  ];

  return required
    .filter((name) => !settings[name])
    .map((variable) => ({ variable, problem: "Required in production", hint: envHint(variable) }));
}

function missingSocialCredentials(): BootProblem[] {
  const config = useRuntimeConfig();
  if (process.env.NODE_ENV !== "production" || !config.auth.requireSocialCredentials) return [];

  const enabled: SocialProviderId[] = config.public.socialProviders;
  const credentials: AuthRuntimeConfig = config.auth;

  return enabled
    .flatMap((id) => {
      const prefix = `NUXT_AUTH_${id.toUpperCase()}`;

      return [
        ...(credentials[id]?.clientId ? [] : [`${prefix}_CLIENT_ID`]),
        ...(credentials[id]?.clientSecret ? [] : [`${prefix}_CLIENT_SECRET`]),
      ];
    })
    .map((variable) => ({ variable, problem: "Required in production", hint: envHint(variable) }));
}

function billingProblems(settings: Record<string, string | undefined>): BootProblem[] {
  if (!useNuxvelConfig().billing) return [];

  const production = process.env.NODE_ENV === "production";
  const testKeysOnly = useRuntimeConfig().stripeTestKeysOnly;

  if (production && !testKeysOnly && /^(sk|rk)_test_/.test(settings.NUXT_STRIPE_SECRET_KEY ?? "")) {
    useLogger("billing").warn("NUXT_STRIPE_SECRET_KEY is a test key: Stripe takes no real payment");
  }

  return checkBillingEnvironment(settings, { production, testKeysOnly }).map(({ variable, problem, hint }) => ({ variable, problem, hint }));
}

export default defineNitroPlugin(() => {
  if (import.meta.prerender) return;

  const settings = environmentSettings(process.env, useRuntimeConfig());
  const problems: BootProblem[] = [
    ...checkEnvironment(settings).map(({ variable, problem, hint }) => ({ variable, problem, hint })),
    ...missingForDefinitions(settings),
    ...missingSocialCredentials(),
    ...billingProblems(settings),
  ];

  if (problems.length === 0) return;

  const lines = problems.map(({ variable, problem }) => `${variable}: ${problem}`);

  useLogger("env").fatal(`invalid environment: ${lines.join("; ")}`, {
    variables: problems.map(({ variable }) => variable),
    problems,
  });

  throw new Error(`nuxvel: invalid environment:\n  ${lines.join("\n  ")}`);
});
