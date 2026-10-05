<script setup lang="ts">
const toast = useToast();
</script>

<template>
  <UButton label="Save" @click="toast.add({ title: 'Post saved', description: 'Your post is live.' })" />
</template>
