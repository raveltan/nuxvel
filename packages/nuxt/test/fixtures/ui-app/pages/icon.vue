<script setup lang="ts">
const shown = ref(false);
</script>

<template>
  <UButton label="Show rocket" @click="shown = true" />
  <UIcon v-if="shown" name="i-lucide-rocket" data-testid="rocket" />
</template>
