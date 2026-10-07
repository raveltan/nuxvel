import { useI18n } from "#imports";
import { useMutation } from "@pinia/colada";
import { type MaybeRefOrGetter, reactive, toValue } from "vue";
import { authClient } from "../auth/client";
import { type AuthMutation, type AuthStatus, unwrapAuth } from "./unwrap-auth";

/**
 * Sends the mail that confirms an email address again.
 *
 * Auto-imported. Call it in `setup`. It has the shape of
 * `$api.x.useMutation()` (`mutate`, `mutateAsync`, `status`,
 * `isLoading`, `data`, `error`, `reset`): `mutate()` sends the mail to
 * `email`, and the link in it opens the home page in the locale of the
 * current page. `error` holds Better Auth's message, or a translated
 * fallback, as {@link unwrapAuth} throws it, such as when the server
 * limits how often the mail is sent.
 *
 * @param email The address, a ref or a getter of it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const route = useRoute();
 * const resend = useResendVerification(() => String(route.query.email));
 * </script>
 *
 * <template>
 *   <UButton label="Send the link again" :loading="resend.isLoading" @click="resend.mutate()" />
 * </template>
 * ```
 */
export function useResendVerification(email: MaybeRefOrGetter<string>): AuthMutation<AuthStatus> {
  const { ts, localePath } = useI18n();

  return reactive(
    useMutation({
      mutation: async (): Promise<AuthStatus> =>
        unwrapAuth(
          await authClient.sendVerificationEmail({ email: toValue(email), callbackURL: localePath("/") }),
          ts("nuxvel.auth.resendFailed"),
        ),
    }),
  );
}
