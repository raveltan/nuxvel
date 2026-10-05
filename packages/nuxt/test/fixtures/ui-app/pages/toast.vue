<script setup lang="ts">
const toast = useToast();
const status = ref("open");
</script>

<template>
  <UButton label="Saving" loading />
  <UButton label="Save" @click="toast.add({ title: 'Post saved', color: 'success' })" />
  <USelect v-model="status" name="status" :items="['open', 'closed']" aria-label="Status" />
  <UProgress :model-value="0" aria-label="Upload progress" />
</template>
