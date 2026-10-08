<script setup lang="ts">
import { AuthForm } from "@nuxvel/nuxt/app/auth";
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">{{ $t("app.signUp") }}</h1>
  <AuthForm mode="sign-up" />
  <p class="mt-4 text-sm text-muted">
    {{ $t("signUp.haveAccount") }}
    <ULink :to="$localeRoute({ name: 'sign-in' })" class="text-primary underline">{{ $t("app.signIn") }}</ULink>
  </p>
</template>
