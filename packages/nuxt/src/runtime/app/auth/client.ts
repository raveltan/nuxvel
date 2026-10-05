import { tryUseNuxtApp } from "#app";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";
import { LOCALE_HEADER } from "../../shared/trpc/locale-header";
import { refreshSession } from "./session";

interface TwoFactorClientPlugin extends ReturnType<typeof twoFactorClient> {}

function twoFactorClientPlugin(): TwoFactorClientPlugin {
  return twoFactorClient();
}

function userFieldsPlugin() {
  return inferAdditionalFields({ user: { role: { type: "string", input: false }, locale: { type: "string", required: false } } });
}

function refreshAfterChange({ request }: { request: { method?: string } }) {
  const nuxtApp = import.meta.client ? tryUseNuxtApp() : null;

  if (nuxtApp && request.method !== "GET") void nuxtApp.runWithContext(refreshSession);
}

function sendLocale({ headers }: { headers: Headers }) {
  const getLocale = tryUseNuxtApp()?.$getLocale;
  const locale: unknown = typeof getLocale === "function" ? getLocale() : undefined;

  if (typeof locale === "string" && locale) headers.set(LOCALE_HEADER, locale);
}

/**
 * Better Auth client for the browser and SSR.
 *
 * Auto-imported. Exposes `signUp`, `signIn`, `signOut`, `useSession` and
 * `twoFactor` (enable, disable and verify a TOTP or backup code). Prefer
 * {@link useUser} for reading the current user in a component: every
 * call made through this client that can change the session (anything
 * but a `GET`) refreshes the session `useUser()` and the `auth` / `guest`
 * middleware read, and the call resolves with that refresh already
 * started, so `navigateTo()` right after `signIn` sees the new user.
 * Every call sends the locale of the current page, so sign-up sets
 * `user.locale` to it. `authClient.updateUser({ locale })` changes the
 * locale of the user, which the auth mails use.
 *
 * @example
 * ```ts
 * await authClient.signIn.email({ email, password });
 * ```
 */
export const authClient = createAuthClient({
  fetchOptions: { onRequest: sendLocale, onSuccess: refreshAfterChange },
  plugins: [twoFactorClientPlugin(), userFieldsPlugin()],
});
