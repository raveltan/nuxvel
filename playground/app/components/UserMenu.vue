<script setup lang="ts">
const { user, signOut } = useUser();

async function signOutAndLeave() {
  await signOut();
  await navigateTo({ name: "index" });
}

const userMenu = computed(() => [
  [{ label: user.value?.email ?? "", type: "label" as const }],
  [{ label: "Sign out", icon: "i-lucide-log-out", onSelect: signOutAndLeave }],
]);
</script>

<template>
  <div class="flex items-center gap-2">
    <NotificationBell />
    <UDropdownMenu v-if="user" :items="userMenu" :modal="false">
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-lucide-circle-user"
        trailing-icon="i-lucide-chevron-down"
        :label="user.email"
      />
    </UDropdownMenu>
  </div>
</template>
