<script setup lang="ts">
const props = defineProps<{ post: Pick<RouterOutputs["post"]["byId"], "id" | "title"> }>();
const emit = defineEmits<{ delete: [] }>();

const abilities = useQuery(useTRPC().post.abilities.queryOptions({ id: props.post.id }));
</script>

<template>
  <div class="flex gap-2">
    <UButton
      v-if="abilities.data.value?.update"
      :to="{ name: 'posts-id-edit', params: { id: post.id } }"
      color="neutral"
      variant="outline"
      icon="i-lucide-pencil"
      label="Edit"
      :aria-label="`Edit ${post.title}`"
    />
    <UButton
      v-if="abilities.data.value?.delete"
      color="error"
      variant="outline"
      icon="i-lucide-trash"
      label="Delete"
      :aria-label="`Delete ${post.title}`"
      @click="emit('delete')"
    />
  </div>
</template>
