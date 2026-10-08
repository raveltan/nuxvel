<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";

const search = ref("");
const q = ref("");
let pending: ReturnType<typeof setTimeout> | undefined;

watch(search, (value) => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    q.value = value;
  }, 300);
});

const posts = $api.post.list.useQuery(() => ({ q: q.value }));
</script>

<template>
  <UFormField label="Search" name="search">
    <UInput v-model="search" />
  </UFormField>
  <p>{{ posts.data?.total ?? 0 }} posts</p>
</template>
