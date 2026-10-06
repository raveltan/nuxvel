<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const route = useRoute();
const input = computed(() => paginationSchema.catch({}).parse(route.query));

const addPost = prependRow({ when: (list) => list.page === 1 && !input.value.q });

const posts = useLiveQuery(() => $api.post.list.queryOptions(input.value), {
  channel: "posts",
  on: {
    created: (list, payload) => addPost(list, postSchema.parse(payload)),
  },
});

const deletePost = $api.post.delete.useMutation({
  optimistic: { key: () => $api.post.list.key(input.value), apply: removeRow() },
  confirm: ({ id }) => {
    const post = posts.data.value?.rows.find((row) => row.id === id);

    return {
      title: "Delete post?",
      description: post && `"${post.title}" will be deleted.`,
      confirmLabel: "Delete",
      color: "error",
    };
  },
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Posts</h1>
      <UButton :to="{ name: 'posts-new' }" icon="i-lucide-plus" label="New post" />
    </div>
    <UAlert
      v-if="deletePost.error"
      role="alert"
      color="error"
      variant="subtle"
      title="Could not delete the post."
      :description="deletePost.error.message"
    />
    <DataTable
      :query="posts"
      :columns="[
        { accessorKey: 'title', header: 'Title' },
        { accessorKey: 'body', header: 'Body' },
        { id: 'actions', header: 'Actions' },
      ]"
      search="Search posts"
    >
      <template #empty>
        <UEmpty
          v-if="input.q"
          icon="i-lucide-search-x"
          title="No posts match your search"
        />
        <UEmpty
          v-else
          icon="i-lucide-notebook-pen"
          title="No posts yet"
          :actions="[{ label: 'Write the first post', to: { name: 'posts-new' } }]"
        />
      </template>
      <template #actions-cell="{ row }">
        <PostActions :post="row.original" @delete="deletePost.mutate({ id: row.original.id })" />
      </template>
    </DataTable>
  </div>
</template>
