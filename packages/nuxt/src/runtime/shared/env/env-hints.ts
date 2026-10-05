const ENV_HINTS: Record<string, string> = {
  NUXT_DATABASE_URL: "Set it to the app's Postgres URL, e.g. postgres://app:secret@db:5432/app",
  NUXT_AUTH_SECRET: "Run nuxvel key:generate to write one of the right strength",
  NUXT_REDIS_URL: "Set it to the Redis URL, e.g. redis://redis:6379",
  NUXT_SITE_URL: "Set it to the public origin of the app, e.g. https://app.example.com (nuxvel app:create sets it on a VPS)",
  NUXT_AUDIT_CHAIN_SECRET: "Set it to a random value of at least 32 characters, e.g. from openssl rand -hex 32, and never change it (nuxvel app:create sets it on a VPS)",
  NUXT_OG_IMAGE_SECRET: "Set it to a random value, e.g. from npx nuxt-og-image generate-secret; it signs the Open Graph image URLs, so each instance and each deploy must use the same one",
  NUXT_MAIL_URL: "Set it to the SMTP URL mail goes out through, e.g. smtp://user:pass@smtp.example.com:587",
  NUXT_STORAGE_URL: "Set it to the S3 endpoint with its keys, e.g. https://key:secret@s3.example.com",
  NUXT_STORAGE_BUCKET: "Set it to the name of the bucket uploads go to",
  NUXT_STRIPE_SECRET_KEY: "Copy a secret or restricted key from the Stripe dashboard, under Developers, API keys; outside production use a test key (sk_test_ or rk_test_)",
  NUXT_STRIPE_WEBHOOK_SECRET: "Copy the signing secret (whsec_) of the webhook endpoint for /api/webhooks/stripe from the Stripe dashboard, under Developers, Webhooks",
  NUXT_LOG_LEVEL: "Use one of silent, fatal, error, warn, info, debug, trace",
  NUXT_LOG_FORMAT: "Use pretty or json",
};

/**
 * The fix for an invalid environment variable, as the server's boot
 * check and `nuxvel doctor` print it under the problem.
 *
 * @example
 * import { envHint } from "@nuxvel/nuxt/env";
 *
 * envHint("NUXT_AUTH_SECRET"); // "Run nuxvel key:generate to write one of the right strength"
 */
export function envHint(variable: string) {
  if (/^NUXT_AUTH_[A-Z]+_CLIENT_(ID|SECRET)$/.test(variable)) {
    return "Copy it from the OAuth app you registered with the provider";
  }

  return ENV_HINTS[variable] ?? `Check ${variable}`;
}
