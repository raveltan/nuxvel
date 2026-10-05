import { useNuxtApp } from "#app";
import { useQueryCache } from "@pinia/colada";
import { computed, getCurrentInstance, onServerPrefetch } from "vue";
import { authClient } from "../auth/client";
import { loadSession, useSessionState } from "../auth/session";
import type { SocialProvider } from "../auth/social-provider";

/**
 * Reactive access to the signed-in user, a way to sign them out, and a
 * way to sign them in with a social provider.
 *
 * Auto-imported. It reads the one session state the `auth` and `guest`
 * middleware share: fetched once per server render, so the page renders
 * signed-in markup on the server, and carried to the browser in the
 * payload, so neither hydration nor navigation fetches it again. On a
 * `cached` route the shared copy has no session, so the browser loads
 * it after hydration and `user` changes from `null` to the user. A
 * sign-in, sign-up or sign-out through {@link authClient} refreshes it.
 * `user` is `null` while signed out and while the session is still
 * loading; `isPending` distinguishes the two. `user.role` is the `role`
 * column of the `user` table. `signOut()` ends the session on the
 * server, clears `user`, drops every cached query (one still in use
 * goes back to `pending` without data) and deletes the
 * service worker's page cache. It also ends the push subscription of
 * this device in the browser. The next user of the device thus never
 * sees the previous user's data or gets their notifications. Navigate
 * away yourself.
 *
 * `signInWith(provider, { callbackURL })` sends the browser to a
 * provider that `nuxvel.auth.social` turns on. The provider sends the
 * user back, signed in, to `callbackURL` (default `/`). It resolves
 * with Better Auth's `{ data, error }`; read `error` when the sign-in
 * could not start. The `<SocialSignIn>` component renders one button
 * per provider.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { user, isPending, signOut } = useUser();
 *
 * async function leave() {
 *   await signOut();
 *   await navigateTo("/");
 * }
 * </script>
 * ```
 *
 * @example
 * ```ts
 * const { signInWith } = useUser();
 *
 * await signInWith("github", { callbackURL: "/dashboard" });
 * ```
 */
export function useUser() {
  const nuxtApp = useNuxtApp();
  const session = useSessionState();
  const queryCache = useQueryCache();

  if (import.meta.client && session.value === undefined) void loadSession();
  // onServerPrefetch marks a useId boundary: register it on the client too, where the session is already hydrated, so the ids match
  if (getCurrentInstance()) onServerPrefetch(() => nuxtApp.runWithContext(loadSession));

  const user = computed(() => session.value?.user ?? null);
  const isPending = computed(() => session.value === undefined);

  async function signOut() {
    await authClient.signOut();
    session.value = null;
    queryCache.cancelQueries();

    for (const entry of queryCache.getEntries()) {
      if (entry.active) queryCache.setEntryState(entry, { status: "pending", data: undefined, error: null });
      else queryCache.remove(entry);
    }
    if ("caches" in globalThis) await caches.delete("nuxvel-pages");
    const registered = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    await (await registered?.pushManager.getSubscription())?.unsubscribe();
  }

  function signInWith(provider: SocialProvider, options: { callbackURL?: string } = {}) {
    return authClient.signIn.social({ provider, ...options });
  }

  return { user, isPending, signOut, signInWith };
}
