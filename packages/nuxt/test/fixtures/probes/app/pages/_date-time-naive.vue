<script setup lang="ts">
const text = new Date("2026-01-15T23:30:00Z").toLocaleString("en-US");
</script>

<template>
  <p class="date-time"><time>{{ text }}</time></p>
</template>
