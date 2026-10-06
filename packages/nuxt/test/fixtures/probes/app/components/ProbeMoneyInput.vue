<script setup lang="ts">
const cents = defineModel<number>();
</script>

<template>
  <UInput
    :model-value="cents === undefined ? '' : (cents / 100).toFixed(2)"
    leading-icon="i-lucide-dollar-sign"
    @update:model-value="(value) => (cents = Math.round(Number(value) * 100))"
  />
</template>
