<script setup lang="ts">
import { AuthForm } from "@nuxvel/nuxt/app/auth";
</script>

<template>
  <h1 class="mb-4 text-lg font-semibold">Sign up</h1>
  <AuthForm mode="sign-up" />
  <p class="mt-4 text-sm text-muted">
    Already have an account? <ULink :to="{ name: 'sign-in' }" class="text-primary underline">Sign in</ULink>
  </p>
</template>
