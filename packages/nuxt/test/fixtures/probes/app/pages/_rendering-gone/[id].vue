<script setup lang="ts">
if (import.meta.server) {
  await $fetch("/api/_rendering-sentinel", { query: { mode: "gone" } });
  setResponseStatus(useRequestEvent()!, 404);
}
</script>

<template>
  <p>gone</p>
</template>
