<script setup lang="ts">
defineProps<{ post: RouterOutputs["post"]["byId"] }>();
</script>

<template>
  <ActionForm
    :action="$api.post.update"
    :defaults="post"
    hidden="id"
    submit-label="Save post"
    :options="{ toast: 'Post saved', onSuccess: () => navigateTo({ name: 'posts' }) }"
  />
</template>
