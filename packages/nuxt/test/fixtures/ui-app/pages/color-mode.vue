<script setup lang="ts">
const colorMode = useColorMode();
</script>

<template>
  <UButton label="Go dark" @click="colorMode.preference = 'dark'" />
</template>
