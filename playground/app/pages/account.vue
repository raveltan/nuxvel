<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const posts = useQuery(useTRPC().account.posts.queryOptions());

const columns = [
  { accessorKey: "createdAt", header: "Written" },
  { accessorKey: "title", header: "Title" },
];
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">Account</h1>
    <p class="text-sm text-muted">Your most recent posts, newest first.</p>
    <QueryState :query="posts">
      <template #empty>
        <UEmpty
          icon="i-lucide-file-text"
          title="No posts yet"
          :actions="[{ label: 'Write a post', to: { name: 'posts-new' } }]"
        />
      </template>
      <template #default="{ data }">
        <UTable :data="data" :columns="columns" caption="Your posts">
          <template #createdAt-cell="{ row }">
            <DateTime :value="row.original.createdAt" />
          </template>
        </UTable>
      </template>
    </QueryState>
  </div>
</template>
