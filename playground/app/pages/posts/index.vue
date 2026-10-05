<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const trpc = useTRPC();
const route = useRoute();
const input = computed(() => paginationSchema.catch({}).parse(route.query));

const posts = useLiveQuery(() => trpc.post.list.queryOptions(input.value), {
  channel: "posts",
  on: {
    created: (list, payload) => {
      const post = postSchema.parse(payload);

      if (list.page > 1 || input.value.q || list.rows.some((row) => row.id === post.id)) return list;

      return { ...list, rows: [post, ...list.rows].slice(0, list.perPage), total: list.total + 1 };
    },
  },
});

const { mutate: deletePost, error: deleteError } = useMutation(
  optimistic(trpc.post.delete.mutationOptions(), {
    key: () => trpc.post.list.key(input.value),
    apply: (list, { id }) => ({ ...list, rows: list.rows.filter((row) => row.id !== id) }),
  }),
);

const confirm = useConfirm();

async function confirmDelete(post: { id: number; title: string }) {
  const confirmed = await confirm({
    title: "Delete post?",
    description: `"${post.title}" will be deleted.`,
    confirmLabel: "Delete",
    color: "error",
  });
  if (confirmed) deletePost({ id: post.id });
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Posts</h1>
      <UButton :to="{ name: 'posts-new' }" icon="i-lucide-plus" label="New post" />
    </div>
    <UAlert
      v-if="deleteError"
      role="alert"
      color="error"
      variant="subtle"
      title="Could not delete the post."
      :description="deleteError.message"
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
        <PostActions :post="row.original" @delete="confirmDelete(row.original)" />
      </template>
    </DataTable>
  </div>
</template>
