<script setup lang="ts">
const postId: string = useRoute("posts-id").params.id;

function openPost() {
  return navigateTo({ name: "posts-id-edit", params: { id: postId } });
}

function openMissingPage() {
  // @ts-expect-error there is no page named no-such-page
  return navigateTo({ name: "no-such-page" });
}

function openPostWithoutId() {
  // @ts-expect-error the posts-id page needs an id
  return navigateTo({ name: "posts-id", params: {} });
}
</script>

<template>
  <button type="button" @click="openPost">Edit</button>
  <button type="button" @click="openMissingPage">Missing</button>
  <button type="button" @click="openPostWithoutId">No id</button>
  <NuxtLink :to="{ name: 'posts-id', params: { id: postId } }">Post</NuxtLink>
  <!-- @vue-expect-error the posts-id page needs an id -->
  <NuxtLink :to="{ name: 'posts-id', params: {} }">Post without id</NuxtLink>
</template>
