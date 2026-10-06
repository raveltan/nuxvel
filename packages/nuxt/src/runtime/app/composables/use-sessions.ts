import { useRequestFetch } from "#app";
import { useI18n } from "#imports";
import { useMutation, useQuery, useQueryCache } from "@pinia/colada";
import { parseJSON } from "better-auth/client";
import { reactive } from "vue";
import { authClient } from "../auth/client";
import type { Session } from "../auth/session";
import { unwrapAuth } from "./unwrap-auth";

/** One session of the signed-in user, as {@link useSessions} lists it. */
export type AuthSession = Session["session"];

const SESSIONS_KEY = ["nuxvel", "auth", "sessions"];

/**
 * The signed-in user's sessions, with a way to sign out one of them or
 * all the others.
 *
 * Auto-imported. Call it in `setup`. `list` is a Pinia Colada query of
 * `/api/auth/list-sessions` wrapped in `reactive()`, so it fits
 * `<QueryState>`. It loads in the browser only, so the session tokens
 * never reach the server-rendered page. Each session has its `token`,
 * `userAgent`, `ipAddress` and `updatedAt`. `revoke` and `revokeOthers`
 * have the shape of `$api.x.useMutation()` (`mutate`, `mutateAsync`,
 * `status`, `isLoading`, `data`, `error`, `reset`), and refresh `list`
 * once they settle. Their `error` holds Better Auth's message, or a
 * translated fallback, as {@link unwrapAuth} throws it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { list, revoke, revokeOthers } = useSessions();
 * </script>
 *
 * <template>
 *   <QueryState :query="list">
 *     <template #default="{ data }">
 *       <UButton v-for="session in data" :key="session.id" :label="session.userAgent ?? ''" @click="revoke.mutate(session.token)" />
 *     </template>
 *   </QueryState>
 *   <UButton label="Sign out everywhere else" :loading="revokeOthers.isLoading" @click="revokeOthers.mutate()" />
 * </template>
 * ```
 */
export function useSessions() {
  const { ts } = useI18n();
  const requestFetch = useRequestFetch();
  const queryCache = useQueryCache();
  const refresh = () => queryCache.invalidateQueries({ key: SESSIONS_KEY });

  const list = useQuery({
    key: SESSIONS_KEY,
    enabled: () => import.meta.client,
    query: async () => parseJSON<AuthSession[]>(await requestFetch<string>("/api/auth/list-sessions", { responseType: "text" })),
  });

  const revoke = useMutation({
    mutation: async (token: string) => unwrapAuth(await authClient.revokeSession({ token }), ts("nuxvel.auth.revokeFailed")),
    onSettled: refresh,
  });

  const revokeOthers = useMutation({
    mutation: async () => unwrapAuth(await authClient.revokeOtherSessions(), ts("nuxvel.auth.revokeOthersFailed")),
    onSettled: refresh,
  });

  return { list: reactive(list), revoke: reactive(revoke), revokeOthers: reactive(revokeOthers) };
}
