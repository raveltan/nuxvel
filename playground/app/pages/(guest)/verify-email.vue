<script setup lang="ts">
const route = useRoute();
const email = typeof route.query.email === "string" ? route.query.email : "";
const resend = useResendVerification(email);
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">Confirm your email address</h1>
  <p class="text-sm">
    A link to confirm your address went to <strong>{{ email || "your email address" }}</strong>. Open it to finish signing up. The link expires in 24 hours.
  </p>
  <UAlert v-if="resend.error" class="mt-4" color="error" :title="resend.error.message" />
  <UAlert v-else-if="resend.data" class="mt-4" color="neutral" variant="subtle" title="A new link is on its way" />
  <UButton v-if="email" class="mt-4" block variant="outline" :loading="resend.isLoading" label="Send the link again" @click="resend.mutate()" />
</template>
