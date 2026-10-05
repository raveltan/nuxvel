<script setup lang="ts">
definePageMeta({ layout: "auth", middleware: "guest" });
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">{{ $t("forgotPassword.heading") }}</h1>
  <AuthForm mode="forgot-password" />
  <p class="mt-4 text-sm text-muted">
    {{ $t("forgotPassword.remembered") }}
    <ULink :to="$localeRoute({ name: 'sign-in' })" class="text-primary underline">{{ $t("app.signIn") }}</ULink>
  </p>
</template>
