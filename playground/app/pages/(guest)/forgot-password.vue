<template>
  <h1 class="mb-4 text-lg font-semibold">Reset your password</h1>
  <AuthForm mode="forgot-password" />
  <p class="mt-4 text-sm text-muted">
    Remembered it? <ULink :to="{ name: 'sign-in' }" class="text-primary underline">Sign in</ULink>
  </p>
</template>
