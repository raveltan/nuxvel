<script setup lang="ts">
import { useRuntimeConfig } from "#app";
import { useI18n } from "#imports";
import { UAlert, UButton } from "#components";
import { ref } from "vue";
import { authClient } from "../auth/client";

/**
 * One Nuxt UI button per provider that `nuxvel.auth.social` turns on.
 * A click sends the browser to the provider, which sends the user back
 * signed in to `/` in the locale of the page. Renders nothing while no
 * provider is on.
 *
 * Auto-registered as a component unless the app sets `nuxvel.ui:
 * false`. To send the user somewhere else, build your own buttons with
 * `useUser().signInWith()`.
 *
 * @example
 * ```vue
 * <SocialSignIn />
 * ```
 */
defineOptions({ name: "SocialSignIn" });

const NAMES: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
  linkedin: "LinkedIn",
  paypal: "PayPal",
  twitter: "X",
  vk: "VK",
  wechat: "WeChat",
};

const { ts, localePath } = useI18n();
const providers: string[] = useRuntimeConfig().public.socialProviders;
const pending = ref<string>();
const failure = ref<string>();

function providerName(provider: string) {
  return NAMES[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

async function signIn(provider: string) {
  pending.value = provider;
  failure.value = undefined;

  const { error } = await authClient.signIn.social({ provider, callbackURL: localePath("/") });

  if (error) {
    pending.value = undefined;
    failure.value = error.message ?? ts("nuxvel.socialSignIn.failed", { provider: providerName(provider) });
  }
}
</script>

<template>
  <div v-if="providers.length > 0" class="space-y-2">
    <UButton
      v-for="provider in providers"
      :key="provider"
      block
      color="neutral"
      variant="outline"
      :loading="pending === provider"
      :disabled="pending !== undefined"
      @click="signIn(provider)"
    >
      {{ $t("nuxvel.socialSignIn.continueWith", { provider: providerName(provider) }) }}
    </UButton>
    <UAlert v-if="failure" color="error" :title="failure" />
  </div>
</template>
