<script setup lang="ts">
import { navigateTo, useRoute } from "#app";
import { useI18n } from "#imports";
import { UAlert, UButton, UForm, UFormField, UInput } from "#components";
import { ref } from "vue";
import { z } from "zod";
import { authClient } from "../auth/client";
import { unwrapAuth } from "../composables/unwrap-auth";
import { useTwoFactor } from "../composables/use-two-factor";
import { bindActionForm } from "../forms/action-form";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "../../shared/auth/schemas";
import SocialSignIn from "./SocialSignIn.vue";

/**
 * The form of a sign-in, sign-up, forgot-password or reset-password
 * page, with the `<SocialSignIn>` buttons under the first two.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. It validates with the schema of its mode (`signInSchema`,
 * `signUpSchema`, `forgotPasswordSchema` or `resetPasswordSchema`) and
 * calls {@link authClient} with the same form behaviour as
 * `useActionForm()`. A field error
 * shows under its field. A refusal from Better Auth, such as a wrong
 * password, shows above the button. Put it on a page with the `guest`
 * middleware.
 *
 * Sign-in opens `/`, or first asks for an authentication code (a
 * 6-digit TOTP or a backup code) when the user has two-factor sign-in
 * on. The sign-in mode also asks for the code at once when the page
 * has `?twoFactor=true`, where a social sign-in of such a user comes
 * back to. Sign-up opens `/`, or `/verify-email?email=...` when the user must
 * confirm their address first. Forgot-password sends the reset mail with
 * a link to `/reset-password` and says so. Reset-password reads the
 * `token` query parameter, sets the new password and opens
 * `/sign-in`. Each of these pages opens in the locale of the form's
 * page: on `/zh/sign-in`, sign-in opens `/zh`. The text of the form is in
 * the locale of the page, from the `nuxvel.authForm` and `nuxvel.auth`
 * translation keys.
 *
 * @param mode - `"sign-in"`, `"sign-up"` (adds a name field),
 * `"forgot-password"` (email only) or `"reset-password"` (new password
 * only).
 *
 * @example
 * ```vue
 * <AuthForm mode="sign-in" />
 * ```
 */
defineOptions({ name: "AuthForm" });

const props = defineProps<{ mode: "sign-in" | "sign-up" | "forgot-password" | "reset-password" }>();

const route = useRoute();
const { ts, localePath } = useI18n();

const needsCode = ref(props.mode === "sign-in" && route.query.twoFactor === "true");

const signIn = bindActionForm(
  signInSchema,
  {
    mutation: async (input) => {
      const data = unwrapAuth(await authClient.signIn.email(input), ts("nuxvel.authForm.signInFailed"));

      needsCode.value = "twoFactorRedirect" in data && data.twoFactorRedirect === true;

      return data;
    },
  },
  { defaults: { email: "", password: "" }, onSuccess: () => (needsCode.value ? undefined : navigateTo(localePath("/"))) },
);

const { verify } = useTwoFactor();

const twoFactor = bindActionForm(
  z.object({ code: z.string().trim().min(1) }),
  { mutation: ({ code }) => verify.mutateAsync(code) },
  { defaults: { code: "" }, onSuccess: () => navigateTo(localePath("/")) },
);

const signUp = bindActionForm(
  signUpSchema,
  {
    mutation: async (input) => unwrapAuth(await authClient.signUp.email(input), ts("nuxvel.authForm.signUpFailed")),
  },
  {
    defaults: { name: "", email: "", password: "" },
    onSuccess: (data) =>
      data.token ? navigateTo(localePath("/")) : navigateTo({ path: localePath("/verify-email"), query: { email: data.user.email } }),
  },
);

const resetLinkSent = ref(false);

const forgotPassword = bindActionForm(
  forgotPasswordSchema,
  {
    mutation: async ({ email }) =>
      unwrapAuth(
        await authClient.requestPasswordReset({ email, redirectTo: localePath("/reset-password") }),
        ts("nuxvel.authForm.resetLinkFailed"),
      ),
  },
  { defaults: { email: "" }, onSuccess: () => (resetLinkSent.value = true) },
);

const resetToken = typeof route.query.token === "string" ? route.query.token : "";

const resetPassword = bindActionForm(
  resetPasswordSchema,
  {
    mutation: async ({ password }) =>
      unwrapAuth(await authClient.resetPassword({ newPassword: password, token: resetToken }), ts("nuxvel.authForm.resetFailed")),
  },
  { defaults: { password: "" }, onSuccess: () => navigateTo(localePath("/sign-in")) },
);

const form = props.mode === "sign-in" ? signIn : signUp;
</script>

<template>
  <div>
    <UForm
      v-if="needsCode"
      :ref="twoFactor.ref"
      :schema="twoFactor.schema"
      :state="twoFactor.state"
      class="space-y-4"
      @submit="twoFactor.submit"
    >
      <UFormField name="code" :label="$ts('nuxvel.authForm.code')" :description="$ts('nuxvel.authForm.codeDescription')">
        <UInput v-model="twoFactor.state.code" autocomplete="one-time-code" class="w-full" />
      </UFormField>
      <UAlert v-if="twoFactor.formError" color="error" :title="twoFactor.formError" />
      <UButton type="submit" block :loading="twoFactor.pending">{{ $t("nuxvel.authForm.verify") }}</UButton>
    </UForm>
    <div v-else-if="mode === 'forgot-password'">
      <UAlert
        v-if="resetLinkSent"
        color="neutral"
        variant="subtle"
        :title="$ts('nuxvel.authForm.resetLinkSent')"
        :description="$ts('nuxvel.authForm.resetLinkSentDescription')"
      />
      <UForm
        v-else
        :ref="forgotPassword.ref"
        :schema="forgotPassword.schema"
        :state="forgotPassword.state"
        class="space-y-4"
        @submit="forgotPassword.submit"
      >
        <UFormField name="email" :label="$ts('nuxvel.authForm.email')">
          <UInput v-model="forgotPassword.state.email" type="email" autocomplete="email" class="w-full" />
        </UFormField>
        <UAlert v-if="forgotPassword.formError" color="error" :title="forgotPassword.formError" />
        <UButton type="submit" block :loading="forgotPassword.pending">{{ $t("nuxvel.authForm.sendResetLink") }}</UButton>
      </UForm>
    </div>
    <div v-else-if="mode === 'reset-password'">
      <UAlert
        v-if="!resetToken"
        color="error"
        variant="subtle"
        :title="$ts('nuxvel.authForm.linkExpired')"
        :description="$ts('nuxvel.authForm.linkExpiredDescription')"
      />
      <UForm
        v-else
        :ref="resetPassword.ref"
        :schema="resetPassword.schema"
        :state="resetPassword.state"
        class="space-y-4"
        @submit="resetPassword.submit"
      >
        <UFormField name="password" :label="$ts('nuxvel.authForm.newPassword')">
          <UInput v-model="resetPassword.state.password" type="password" autocomplete="new-password" class="w-full" />
        </UFormField>
        <UAlert v-if="resetPassword.formError" color="error" :title="resetPassword.formError" />
        <UButton type="submit" block :loading="resetPassword.pending">{{ $t("nuxvel.authForm.setNewPassword") }}</UButton>
      </UForm>
    </div>
    <UForm
      v-else
      :ref="form.ref"
      :schema="form.schema"
      :state="form.state"
      class="space-y-4"
      @submit="form.submit"
    >
      <UFormField v-if="mode === 'sign-up'" name="name" :label="$ts('nuxvel.authForm.name')">
        <UInput v-model="signUp.state.name" autocomplete="name" class="w-full" />
      </UFormField>
      <UFormField name="email" :label="$ts('nuxvel.authForm.email')">
        <UInput v-model="form.state.email" type="email" autocomplete="email" class="w-full" />
      </UFormField>
      <UFormField name="password" :label="$ts('nuxvel.authForm.password')">
        <UInput
          v-model="form.state.password"
          type="password"
          :autocomplete="mode === 'sign-in' ? 'current-password' : 'new-password'"
          class="w-full"
        />
      </UFormField>
      <UAlert v-if="form.formError" color="error" :title="form.formError" />
      <UButton type="submit" block :loading="form.pending">
        {{ $t(mode === "sign-in" ? "nuxvel.authForm.signIn" : "nuxvel.authForm.signUp") }}
      </UButton>
    </UForm>
    <SocialSignIn v-if="!needsCode && (mode === 'sign-in' || mode === 'sign-up')" class="mt-4" />
  </div>
</template>
