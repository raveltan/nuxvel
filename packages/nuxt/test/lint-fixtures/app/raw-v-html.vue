<script setup lang="ts">
defineProps<{ body: string }>();
</script>

<template>
  <article v-html="body" />
</template>
