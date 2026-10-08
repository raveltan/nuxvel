<script setup lang="ts">
import type { RouterOutputs } from "@nuxvel/nuxt/app/api";

defineProps<{ post: Pick<RouterOutputs["post"]["byId"], "id" | "title" | "can"> }>();
const emit = defineEmits<{ delete: [] }>();
</script>

<template>
  <div class="flex gap-2">
    <UButton
      v-if="post.can.update"
      :to="{ name: 'posts-id-edit', params: { id: post.id } }"
      color="neutral"
      variant="outline"
      icon="i-lucide-pencil"
      label="Edit"
      :aria-label="`Edit ${post.title}`"
    />
    <UButton
      v-if="post.can.delete"
      color="error"
      variant="outline"
      icon="i-lucide-trash"
      label="Delete"
      :aria-label="`Delete ${post.title}`"
      @click="emit('delete')"
    />
  </div>
</template>
