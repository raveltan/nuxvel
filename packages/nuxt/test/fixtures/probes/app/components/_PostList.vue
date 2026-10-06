<script setup lang="ts">
const posts = $api.post.list.useQuery();
const deletePost = $api.post.delete.useMutation();
</script>

<template>
  <ul>
    <li v-for="post in posts.data?.rows ?? []" :key="post.id">
      {{ post.title }}
      <UButton :aria-label="`Delete ${post.title}`" label="Delete" @click="deletePost.mutate({ id: post.id })" />
    </li>
  </ul>
</template>
