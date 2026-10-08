<script setup lang="ts">
import { useResendVerification } from "@nuxvel/nuxt/app/auth";

const route = useRoute();
const email = typeof route.query.email === "string" ? route.query.email : "";
const resend = useResendVerification(email);
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">{{ $t("verifyEmail.heading") }}</h1>
  <i18n-t keypath="verifyEmail.sentTo" tag="p" class="text-sm">
    <template #email>
      <strong>{{ email || $t("verifyEmail.yourAddress") }}</strong>
    </template>
  </i18n-t>
  <UAlert v-if="resend.error" class="mt-4" color="error" :title="resend.error.message" />
  <UAlert v-else-if="resend.data" class="mt-4" color="neutral" variant="subtle" :title="$ts('verifyEmail.resent')" />
  <UButton v-if="email" class="mt-4" block variant="outline" :loading="resend.isLoading" :label="$ts('verifyEmail.resend')" @click="resend.mutate()" />
</template>
