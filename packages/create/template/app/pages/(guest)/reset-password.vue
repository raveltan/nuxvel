<script setup lang="ts">
import { AuthForm } from "@nuxvel/nuxt/app/auth";
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">{{ $t("resetPassword.heading") }}</h1>
  <AuthForm mode="reset-password" />
  <p class="mt-4 text-sm text-muted">
    {{ $t("resetPassword.needLink") }}
    <ULink :to="$localeRoute({ name: 'forgot-password' })" class="text-primary underline">{{ $t("resetPassword.sendAgain") }}</ULink>
  </p>
</template>
