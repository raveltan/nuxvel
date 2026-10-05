import type { SocialProviderList } from "better-auth/social-providers";

/**
 * A social provider `nuxvel.auth.social` can turn on: every provider
 * Better Auth ships that signs in with a client ID and a client secret
 * alone. `cognito` and `tiktok` need other settings and are not in it.
 */
export type SocialProviderId = Exclude<SocialProviderList[number], "cognito" | "tiktok">;

/**
 * The OAuth app of one social provider, from
 * `NUXT_AUTH_<PROVIDER>_CLIENT_ID` and `NUXT_AUTH_<PROVIDER>_CLIENT_SECRET`.
 */
export interface SocialProviderCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * `runtimeConfig.auth`: the OAuth app of each provider in
 * `nuxvel.auth.social`, and the auth checks that differ between builds.
 */
export type AuthRuntimeConfig = Partial<Record<SocialProviderId, SocialProviderCredentials>> & {
  /**
   * Refuses a password sign-in until the user confirms their email
   * address. On in a production build, off in development and test
   * builds. Set it with `NUXT_AUTH_REQUIRE_EMAIL_VERIFICATION`.
   */
  requireEmailVerification: boolean;
  /**
   * Refuses a new password found in the Have I Been Pwned corpus. On in
   * production and development builds, off in test builds. Set it with
   * `NUXT_AUTH_CHECK_BREACHED_PASSWORDS`.
   */
  checkBreachedPasswords: boolean;
  /**
   * Makes the server refuse to start in production while a provider in
   * `nuxvel.auth.social` has no client ID or client secret. On in every
   * build except a test build, and never checked in the prerender process.
   * Set it with `NUXT_AUTH_REQUIRE_SOCIAL_CREDENTIALS`.
   */
  requireSocialCredentials: boolean;
  /**
   * The Cloudflare Turnstile secret key. Once it is set, sign-up and
   * password reset requests need a Turnstile token. Set it with
   * `NUXT_AUTH_TURNSTILE_SECRET_KEY`.
   */
  turnstileSecretKey: string;
  /**
   * Refuses sign-up and email change with a disposable email domain,
   * from `nuxvel.auth.blockDisposableEmails`. Set it with
   * `NUXT_AUTH_BLOCK_DISPOSABLE_EMAILS`.
   */
  blockDisposableEmails: boolean;
};
