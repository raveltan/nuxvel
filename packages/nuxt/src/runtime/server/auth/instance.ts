import type { Auth, BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { createAuthMiddleware } from "better-auth/api";
import { captcha } from "better-auth/plugins";
import { twoFactor } from "better-auth/plugins/two-factor";
import { useRuntimeConfig } from "nitropack/runtime";
import { z } from "zod";
import type { AuthRuntimeConfig, SocialProviderCredentials, SocialProviderId } from "../../shared/auth/social-provider-id";
import { useDb } from "../database/client";
import { schemaTable } from "../database/schema-table";
import { sendMail } from "../mail/send-mail";
import { currentLocale } from "../i18n/current-locale";
import { localizedLink } from "./localized-link";
import { mailLocale } from "./mail-locale";
import { closeSessionStreams } from "../realtime/streams/revoked-sessions";
import { useSecrets } from "../security/secrets";
import { useNuxvelConfig } from "../utils/config";
import { runAfterResponse } from "./after-response";
import { revokeApiKeys } from "./api-keys";
import { blockDisposableEmails } from "./disposable-emails";
import { mayMailExistingAccount } from "./existing-account-limit";
import { authRateLimit, CLIENT_IP_HEADER } from "./rate-limit";
import { requireFreshEmailChange } from "./fresh-sign-in";
import { noticeTwoFactorChange, securityNotices } from "./security-notices";
import { secretVersion } from "./secret-version";
import { signInDelay } from "./sign-in-delay";
import { logAuth } from "./log";
import { refuseImageInput } from "./user-image";
import { refuseLongName } from "./user-name";

function socialProviders(): Partial<Record<SocialProviderId, SocialProviderCredentials>> {
  const config = useRuntimeConfig();
  const enabled: SocialProviderId[] = config.public.socialProviders;
  const credentials: AuthRuntimeConfig = config.auth;

  return Object.fromEntries(enabled.map((id) => [id, credentials[id]]));
}

const DAY_IN_SECONDS = 24 * 60 * 60;

/** Better Auth's two-factor plugin as the auth instance uses it. */
export interface TwoFactorPlugin extends ReturnType<typeof twoFactor> {}

const SOCIAL_SIGN_IN_PATHS = ["/callback/:id", "/sign-in/social"];

function twoFactorPlugin(): TwoFactorPlugin {
  const plugin = twoFactor({ issuer: useNuxvelConfig().siteName });
  const challenge = plugin.hooks.after.map((hook) => ({
    ...hook,
    matcher: (context: Parameters<typeof hook.matcher>[0]) =>
      hook.matcher(context) ||
      SOCIAL_SIGN_IN_PATHS.includes(context.path ?? "") ||
      (context.path === "/verify-email" && context.context.newSession?.session.id !== context.context.session?.session.id),
  }));
  const askForCode = {
    matcher: (context: { path?: string }) => context.path === "/callback/:id" || context.path === "/verify-email",
    handler: createAuthMiddleware(async (ctx) => {
      if (ctx.context.returned && typeof ctx.context.returned === "object" && "twoFactorRedirect" in ctx.context.returned) {
        ctx.setHeader("location", `${useRuntimeConfig().public.signInPath}?twoFactor=true`);
      }

      return undefined;
    }),
  };

  return { ...plugin, hooks: { ...plugin.hooks, after: [...challenge, askForCode] } };
}

const MIN_PASSWORD_LENGTH = 12;

const SECOND_FACTOR_PATHS = ["/two-factor/verify-totp", "/two-factor/verify-backup-code", "/two-factor/verify-otp"];

function turnstile(secretKey: string): BetterAuthPlugin {
  return captcha({
    provider: "cloudflare-turnstile",
    secretKey,
    endpoints: ["/sign-up/email", "/request-password-reset"],
  });
}

function knownLocale() {
  const { locales } = useRuntimeConfig().i18nLocales;

  return z.string().refine((code) => locales.includes(code), { message: `The locale must be one of: ${locales.join(", ")}` });
}

function authSchema() {
  return {
    user: schemaTable("user"),
    session: schemaTable("session"),
    account: schemaTable("account"),
    verification: schemaTable("verification"),
    twoFactor: schemaTable("two_factor"),
  };
}

function authOptions(secrets: string[]) {
  const runtimeConfig = useRuntimeConfig();
  const config: AuthRuntimeConfig = runtimeConfig.auth;
  const siteUrl: string = runtimeConfig.siteUrl;

  return {
    database: drizzleAdapter(useDb({ root: true }), { provider: "pg", schema: authSchema() }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      requireEmailVerification: config.requireEmailVerification,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }): Promise<void> => {
        const locale = mailLocale(user);
        await sendMail("nuxvel.auth.reset-password", { to: user.email, name: user.name, url: localizedLink(url, locale) }, { locale });
      },
      onPasswordReset: async ({ user }): Promise<void> => {
        await revokeApiKeys(user.id);
        await sendMail("nuxvel.auth.security-notice", { to: user.email, name: user.name, change: "password" }, { locale: mailLocale(user) });
      },
      onExistingUserSignUp: async ({ user }): Promise<void> => {
        if (await mayMailExistingAccount(user.email)) await sendMail("nuxvel.auth.existing-account", { to: user.email }, { locale: mailLocale(user) });
      },
    },
    emailVerification: {
      expiresIn: DAY_IN_SECONDS,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }): Promise<void> => {
        const locale = mailLocale(user);
        await sendMail("nuxvel.auth.verify-email", { to: user.email, url: localizedLink(url, locale) }, { locale });
      },
    },
    socialProviders: socialProviders(),
    plugins: [
      haveIBeenPwned({ enabled: config.checkBreachedPasswords }),
      twoFactorPlugin(),
      signInDelay(),
      securityNotices(),
      requireFreshEmailChange(),
      refuseImageInput(),
      ...(config.turnstileSecretKey ? [turnstile(config.turnstileSecretKey)] : []),
      ...(config.blockDisposableEmails ? [blockDisposableEmails()] : []),
    ],
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, url }): Promise<void> => {
          const locale = mailLocale(user);
          await sendMail("nuxvel.auth.security-notice", { to: user.email, name: user.name, change: "email", url: localizedLink(url, locale) }, { locale });
        },
      },
      additionalFields: {
        role: { type: "string", input: false, defaultValue: "user" },
        locale: { type: "string", required: false, defaultValue: () => currentLocale(), validator: { input: knownLocale() } },
      },
    },
    session: {
      additionalFields: {
        twoFactorVerified: { type: "boolean", input: false, defaultValue: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (_session, context) =>
            SECOND_FACTOR_PATHS.includes(context?.path ?? "") ? { data: { twoFactorVerified: true } } : undefined,
        },
        delete: { after: (session) => closeSessionStreams(session.id) },
      },
      user: {
        create: { before: async (user) => refuseLongName(user) },
        update: { before: async (user) => refuseLongName(user), after: noticeTwoFactorChange },
      },
    },
    logger: { log: logAuth },
    rateLimit: authRateLimit(),
    advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] }, backgroundTasks: { handler: runAfterResponse } },
    baseURL: siteUrl || undefined,
    secrets: secrets.map((value) => ({ version: secretVersion(value), value })),
  } satisfies BetterAuthOptions;
}

/** The Better Auth instance that {@link authInstance} returns. */
export type AuthInstance = Auth<ReturnType<typeof authOptions>>;

const instances = new Map<string, AuthInstance>();

function instanceFor(secrets: string[]): AuthInstance {
  const key = secrets.join("\n");
  const existing = instances.get(key);
  if (existing) return existing;

  const instance = betterAuth(authOptions(secrets));
  instances.set(key, instance);

  return instance;
}

/**
 * The Better Auth server instance, backed by the app's Drizzle schema
 * with email and password sign-in enabled, plus the social providers
 * `nuxvel.auth.social` turns on. The session user carries the
 * `user.role` column, which sign-up cannot set, and the `user.locale`
 * column. Sign-up sets the locale to {@link currentLocale}, and
 * `/api/auth/update-user` changes it to another locale of the app. The
 * auth mails render in the locale of the user. Deleting a session, on
 * sign-out or when a password change revokes it, ends the realtime
 * streams it opened. Every `/api/auth/*`
 * endpoint goes through Better Auth's rate limiter, counted in Redis per
 * client IP. While `runtimeConfig.auth.requireEmailVerification` is on, a
 * password sign-in needs a confirmed email address, and sign-up sends the
 * `nuxvel.auth.verify-email` mail with a link that expires after 24 hours.
 * Better Auth's warnings and errors go to `useLogger("auth")`, and an error
 * with an `Error` goes to the error tracker.
 * The verification and existing-account mails do not print the name of the
 * user. An address gets at most one existing-account mail an hour.
 * After 5 failed password sign-ins on one email address, each next one
 * waits longer before it answers, up to 30 seconds.
 * `/api/auth/change-email` for a verified address mails a
 * `nuxvel.auth.security-notice` with an approval link to the current
 * address. Only after that link opens does the new address get its
 * confirmation link. An unverified address skips the approval step, and
 * its `nuxvel.auth.security-notice` mail has no link.
 * `/api/auth/change-email` needs a session that started in the last 10
 * minutes. An older session gets `FORBIDDEN` with the code
 * `SESSION_NOT_FRESH`.
 * The same notice
 * goes out on a sign-in from a device the user has not signed in from,
 * on a password change and when two-factor sign-in turns on or off.
 * A password reset and a password change delete every API key of the user.
 * A password change also ends every other session of the user. The session that changes the password stays, with its two-factor state.
 * Better Auth's two-factor plugin adds TOTP and backup codes under
 * `/api/auth/two-factor/*`; a user with it on signs in in two steps,
 * with a password, with a social provider and with an email link that
 * starts a new session. After a social provider or an email link,
 * the browser opens `nuxvel.auth.signInPath` with `?twoFactor=true`.
 * A session that starts from a valid second factor, at sign-in or when
 * the TOTP confirmation turns two-factor on, has `twoFactorVerified`
 * set; {@link adminProcedure} requires it.
 * Once `NUXT_AUTH_TURNSTILE_SECRET_KEY` is set, sign-up and password
 * reset requests need a Cloudflare Turnstile token in the
 * `x-captcha-response` header.
 * With `nuxvel.auth.blockDisposableEmails`, sign-up and email change
 * refuse a disposable email domain.
 * Sign-up and `/api/auth/update-user` refuse an `image`. Only server code
 * and a social provider set `user.image`.
 * Sign-up, `/api/auth/update-user` and a social sign-in refuse a `name`
 * with more than 200 characters, with `NAME_TOO_LONG`.
 *
 * The links in its mails and the origin it trusts come from
 * `runtimeConfig.siteUrl` (`NUXT_SITE_URL`), not from the `Host` header of
 * the request; while it is empty, outside production, they come from the
 * request.
 *
 * Signs with the current `NUXT_AUTH_SECRET` and encrypts two-factor
 * secrets and backup codes with it. It decrypts them with the current
 * secret or with a previous one that is still inside its grace period.
 * The verification, password-reset, existing-account and email-change
 * mails go out after the response. Thus a request takes the same time
 * whether or not the email has an account. Better Auth logs a mail that
 * fails. The built-in `nuxvel.auth.reencrypt-two-factor` schedule encrypts them
 * again with the current secret. A rotation applies once the server
 * restarts with the new value. Server code should use the auto-imported
 * `auth()` and `requireAuth()` helpers rather than this instance.
 */
export function authInstance(): AuthInstance {
  return instanceFor(useSecrets("NUXT_AUTH_SECRET"));
}

/**
 * Every instance allowed to verify an incoming session: the current
 * secret first, then a previous one still inside the grace period
 * `nuxvel key:rotate` gave it.
 *
 * Only {@link authInstance} issues sessions.
 */
export function verifyingAuthInstances(): AuthInstance[] {
  const [, ...previous] = useSecrets("NUXT_AUTH_SECRET");

  return [authInstance(), ...previous.map((secret) => instanceFor([secret]))];
}
