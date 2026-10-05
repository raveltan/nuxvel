<script setup lang="ts">
const route = useRoute();

if (import.meta.server && route.query.kind === "upstream") await $fetch("/api/_leak_probe_secret_upstream");
if (import.meta.server && route.query.kind === "plain") throw new Error("leak_probe_secret in a page");
</script>

<template>
  <p>rendered</p>
</template>
