<script setup lang="ts">
const { user, signOut } = useUser();

const demos = [
  {
    title: "Auth",
    description: "Email and password sign-up and sign-in, with the app layout's user menu.",
    to: { name: "sign-up" },
    label: "Sign up",
  },
  {
    title: "Posts",
    description: "Database and typed API: a list, create and edit forms, optimistic delete, policy-gated actions.",
    to: { name: "posts" },
    label: "Open posts",
  },
  {
    title: "Account",
    description: "Your own posts, newest first, read from the posts table.",
    to: { name: "account" },
    label: "Open account",
  },
  {
    title: "Jobs",
    description: "Dispatch a background job and follow its progress and outcome live.",
    to: { name: "jobs" },
    label: "Open jobs",
  },
  {
    title: "Profile",
    description: "Upload an avatar straight to storage and queue a welcome mail to yourself.",
    to: { name: "profile" },
    label: "Open profile",
  },
  {
    title: "Flags",
    description: "Feature flag and experiment values for you, updating live when targeting changes.",
    to: { name: "flags" },
    label: "Open flags",
  },
] as const;
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">nuxvel playground</h1>
      <div v-if="user" class="flex items-center gap-3">
        <p class="text-sm text-muted">Signed in as {{ user.email }}</p>
        <UButton color="neutral" variant="outline" label="Sign out" @click="signOut" />
      </div>
      <div v-else class="flex items-center gap-2">
        <UButton :to="{ name: 'sign-in' }" color="neutral" variant="outline" label="Sign in" />
        <UButton :to="{ name: 'sign-up' }" label="Sign up" />
      </div>
    </div>
    <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="demo in demos" :key="demo.title">
        <UCard class="h-full">
          <template #header>
            <h2 class="font-semibold">{{ demo.title }}</h2>
          </template>
          <p class="text-sm text-muted">{{ demo.description }}</p>
          <template #footer>
            <UButton :to="demo.to" variant="link" :label="demo.label" />
          </template>
        </UCard>
      </li>
    </ul>
  </div>
</template>
