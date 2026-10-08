<script setup lang="ts">
import { AuthForm } from "@nuxvel/nuxt/app/auth";
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">{{ $t("app.signIn") }}</h1>
  <AuthForm mode="sign-in" />
  <p class="mt-4 text-sm text-muted">
    <ULink :to="$localeRoute({ name: 'forgot-password' })" class="text-primary underline">{{ $t("signIn.forgotPassword") }}</ULink>
  </p>
  <p class="mt-2 text-sm text-muted">
    {{ $t("signIn.newHere") }}
    <ULink :to="$localeRoute({ name: 'sign-up' })" class="text-primary underline">{{ $t("app.signUp") }}</ULink>
  </p>
</template>
