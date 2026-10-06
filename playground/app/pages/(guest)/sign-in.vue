<template>
  <h1 class="mb-4 text-lg font-semibold">Sign in</h1>
  <AuthForm mode="sign-in" />
  <p class="mt-4 text-sm text-muted">
    <ULink :to="{ name: 'forgot-password' }" class="text-primary underline">Forgot your password?</ULink>
  </p>
  <p class="mt-2 text-sm text-muted">
    New here? <ULink :to="{ name: 'sign-up' }" class="text-primary underline">Sign up</ULink>
  </p>
</template>
