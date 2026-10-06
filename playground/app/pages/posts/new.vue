<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">New post</h1>
    <ActionForm
      :action="$api.post.create"
      :defaults="{ title: '', body: '' }"
      submit-label="Create post"
      :options="{ onSuccess: () => navigateTo({ name: 'posts' }) }"
    />
  </div>
</template>
