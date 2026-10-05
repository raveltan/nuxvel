<script setup lang="ts">
const mode = String(useRoute().params.mode);
const { user } = useUser();

if (import.meta.server) {
  await $fetch("/api/_rendering-sentinel", { query: { mode } });
}
</script>

<template>
  <p class="rendering">rendering:{{ mode }}</p>
  <p class="user">user:{{ user?.name ?? "guest" }}</p>
</template>
