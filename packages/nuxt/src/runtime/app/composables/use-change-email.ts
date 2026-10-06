import { useRoute } from "#app";
import { useI18n } from "#imports";
import { useMutation } from "@pinia/colada";
import { computed, reactive } from "vue";
import { authClient } from "../auth/client";
import { unwrapAuth } from "./unwrap-auth";

/**
 * Asks Better Auth to change the signed-in user's email address.
 *
 * Auto-imported. Call it in `setup`. It has the shape of
 * `$api.x.useMutation()` (`mutate`, `mutateAsync`, `status`,
 * `isLoading`, `data`, `error`, `reset`): `mutate(newEmail)` sends the
 * mail that confirms the change, and the link in it opens the current
 * page again. `requested` turns `true` once the mail is on its way.
 * `error` holds Better Auth's message, or a translated fallback, as
 * {@link unwrapAuth} throws it. Better Auth refuses a session older
 * than 10 minutes.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const email = ref("");
 * const changeEmail = useChangeEmail();
 * </script>
 *
 * <template>
 *   <form @submit.prevent="changeEmail.mutate(email)">
 *     <UInput v-model="email" type="email" />
 *     <UButton type="submit" label="Change" :loading="changeEmail.isLoading" />
 *     <p v-if="changeEmail.requested">Open the link in the mail we sent you.</p>
 *   </form>
 * </template>
 * ```
 */
export function useChangeEmail() {
  const { ts } = useI18n();
  const route = useRoute();
  const mutation = useMutation({
    mutation: async (newEmail: string) =>
      unwrapAuth(await authClient.changeEmail({ newEmail, callbackURL: route.fullPath }), ts("nuxvel.auth.changeEmailFailed")),
  });

  return reactive({ ...mutation, requested: computed(() => mutation.status.value === "success") });
}
