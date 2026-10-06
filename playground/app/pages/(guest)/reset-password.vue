<template>
  <h1 class="mb-4 text-lg font-semibold">Choose a new password</h1>
  <AuthForm mode="reset-password" />
  <p class="mt-4 text-sm text-muted">
    Need a new link? <ULink :to="{ name: 'forgot-password' }" class="text-primary underline">Send it again</ULink>
  </p>
</template>
