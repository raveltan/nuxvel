<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "guest" });

const route = useRoute();
const email = typeof route.query.email === "string" ? route.query.email : "";

const {
  mutate: resend,
  isLoading: sending,
  data: resent,
  error,
} = useMutation({
  mutation: async () => {
    const { error: refused } = await authClient.sendVerificationEmail({ email, callbackURL: "/" });

    if (refused) throw new Error(refused.message ?? "Could not send the link again");

    return true;
  },
});
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">Confirm your email address</h1>
  <p class="text-sm">
    A link to confirm your address went to <strong>{{ email || "your email address" }}</strong>. Open it to finish signing up. The link expires in 24 hours.
  </p>
  <UAlert v-if="error" class="mt-4" color="error" :title="error.message" />
  <UAlert v-else-if="resent" class="mt-4" color="neutral" variant="subtle" title="A new link is on its way" />
  <UButton v-if="email" class="mt-4" block variant="outline" :loading="sending" label="Send the link again" @click="resend()" />
</template>
