<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "guest" });

const route = useRoute();
const { ts } = useI18n();
const email = typeof route.query.email === "string" ? route.query.email : "";

const {
  mutate: resend,
  isLoading: sending,
  data: resent,
  error,
} = useMutation({
  mutation: async () => {
    const { error: refused } = await authClient.sendVerificationEmail({ email, callbackURL: "/" });

    if (refused) throw new Error(refused.message ?? ts("verifyEmail.resendFailed"));

    return true;
  },
});
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">{{ $t("verifyEmail.heading") }}</h1>
  <i18n-t keypath="verifyEmail.sentTo" tag="p" class="text-sm">
    <template #email>
      <strong>{{ email || $t("verifyEmail.yourAddress") }}</strong>
    </template>
  </i18n-t>
  <UAlert v-if="error" class="mt-4" color="error" :title="error.message" />
  <UAlert v-else-if="resent" class="mt-4" color="neutral" variant="subtle" :title="$ts('verifyEmail.resent')" />
  <UButton v-if="email" class="mt-4" block variant="outline" :loading="sending" :label="$ts('verifyEmail.resend')" @click="resend()" />
</template>
