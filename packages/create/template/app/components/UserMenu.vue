<script setup lang="ts">
import { useUser } from "@nuxvel/nuxt/app/auth";

const { user, isPending, signOut } = useUser();
const { ts, localeRoute } = useI18n();

async function signOutAndLeave() {
  await signOut();
  await navigateTo(localeRoute({ name: "index" }));
}

const userMenu = computed(() => [
  [{ label: user.value?.email ?? "", type: "label" as const }],
  [{ label: ts("app.signOut"), icon: "i-lucide-log-out", onSelect: signOutAndLeave }],
]);
</script>

<template>
  <UDropdownMenu v-if="user" :items="userMenu" :modal="false">
    <UButton
      variant="ghost"
      color="neutral"
      icon="i-lucide-circle-user"
      trailing-icon="i-lucide-chevron-down"
      :label="user.email"
    />
  </UDropdownMenu>
  <UButton v-else-if="!isPending" :to="$localeRoute({ name: 'sign-in' })" variant="ghost" color="neutral" :label="$ts('app.signIn')" />
</template>
