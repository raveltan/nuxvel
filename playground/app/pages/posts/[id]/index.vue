<script setup lang="ts">
const route = useRoute();
const post = useQuery(useTRPC().post.byId.queryOptions({ id: Number(route.params.id) }));

useSeo(() => ({
  title: post.data.value?.title ?? "Post",
  description: post.data.value?.body.slice(0, 160),
  type: "article",
}));
</script>

<template>
  <QueryState :query="post">
    <template #default="{ data }">
      <article class="max-w-xl space-y-4">
        <h1 class="text-2xl font-semibold">{{ data.title }}</h1>
        <p>{{ data.body }}</p>
      </article>
    </template>
  </QueryState>
</template>
