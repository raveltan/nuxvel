import { useI18n } from "#imports";
import { useMutation } from "@pinia/colada";
import { computed, type ComputedRef, reactive } from "vue";
import { authClient } from "../auth/client";
import { type AuthMutation, type AuthStatus, unwrapAuth } from "./unwrap-auth";

/** What `enable` of {@link useTwoFactor} resolves with. */
export interface TwoFactorSetup {
  /** The `otpauth://` URI for the authenticator app, as a QR code or a key. */
  totpURI: string;
  /** The backup codes, each of which works once. */
  backupCodes: string[];
}

/** What {@link useTwoFactor} returns. */
export interface TwoFactor {
  /** Checks the password and starts the setup. */
  enable: AuthMutation<TwoFactorSetup, string>;
  /** Checks a TOTP or a backup code. */
  verify: AuthMutation<void, string>;
  /** Checks the password and turns two-factor sign-in off. */
  disable: AuthMutation<AuthStatus, string>;
  /** The backup codes that `enable` returned. */
  backupCodes: ComputedRef<string[]>;
}

/**
 * Turns the signed-in user's two-factor sign-in on and off, and checks a
 * code from their authenticator app.
 *
 * Auto-imported. Call it in `setup`. `enable`, `verify` and `disable`
 * have the shape of `$api.x.useMutation()` (`mutate`, `mutateAsync`,
 * `status`, `isLoading`, `data`, `error`, `reset`).
 * `enable.mutate(password)` resolves with the `totpURI` for the
 * authenticator app and the `backupCodes`, which `backupCodes` also
 * holds. Two-factor sign-in is on once `verify.mutate(code)` accepts a
 * code: a 6-digit TOTP, or else a backup code. The same `verify` checks
 * the code of a sign-in that asks for one. `disable.mutate(password)`
 * turns it off. Each refreshes the session, so
 * `useUser().user.twoFactorEnabled` follows. `error` holds Better
 * Auth's message, or a translated fallback, as {@link unwrapAuth}
 * throws it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const password = ref("");
 * const code = ref("");
 * const { enable, verify, backupCodes } = useTwoFactor();
 * </script>
 *
 * <template>
 *   <form v-if="!enable.data" @submit.prevent="enable.mutate(password)">
 *     <UInput v-model="password" type="password" />
 *   </form>
 *   <form v-else @submit.prevent="verify.mutate(code)">
 *     <code>{{ enable.data.totpURI }}</code>
 *     <p>{{ backupCodes.join(", ") }}</p>
 *     <UInput v-model="code" autocomplete="one-time-code" />
 *   </form>
 * </template>
 * ```
 */
export function useTwoFactor(): TwoFactor {
  const { ts } = useI18n();

  const enable = useMutation({
    mutation: async (password: string): Promise<TwoFactorSetup> => {
      const data = unwrapAuth(await authClient.twoFactor.enable({ password }), ts("nuxvel.auth.enableTwoFactorFailed"));

      if (!("totpURI" in data)) throw new Error(ts("nuxvel.auth.enableTwoFactorFailed"));

      return { totpURI: data.totpURI, backupCodes: data.backupCodes };
    },
  });

  const verify = useMutation({
    mutation: async (code: string) => {
      unwrapAuth(
        /^\d{6}$/.test(code) ? await authClient.twoFactor.verifyTotp({ code }) : await authClient.twoFactor.verifyBackupCode({ code }),
        ts("nuxvel.auth.verifyFailed"),
      );
    },
  });

  const disable = useMutation({
    mutation: async (password: string): Promise<AuthStatus> => unwrapAuth(await authClient.twoFactor.disable({ password }), ts("nuxvel.auth.disableTwoFactorFailed")),
  });

  return {
    enable: reactive(enable),
    verify: reactive(verify),
    disable: reactive(disable),
    backupCodes: computed(() => enable.data.value?.backupCodes ?? []),
  };
}
