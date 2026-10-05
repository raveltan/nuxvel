<script setup lang="ts">
const { data } = await useFetch<string[]>("/api/_cached-posts-check");
</script>

<template>
  <p class="posts">posts:{{ data?.join(",") }}</p>
</template>
