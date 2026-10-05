<script setup lang="ts">
const search = ref("");
const q = ref("");
let pending: ReturnType<typeof setTimeout> | undefined;

watch(search, (value) => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    q.value = value;
  }, 300);
});

const trpc = useTRPC();
const posts = useQuery(() => trpc.post.list.queryOptions({ q: q.value }));
</script>

<template>
  <UFormField label="Search" name="search">
    <UInput v-model="search" />
  </UFormField>
  <p>{{ posts.data.value?.total ?? 0 }} posts</p>
</template>
