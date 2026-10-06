<script setup lang="ts">
const props = defineProps<{ post: RouterOutputs["post"]["byId"] }>();

const form = useActionForm(updatePostInput, $api.post.update.mutationOptions({ toast: "Post saved" }), {
  defaults: { id: props.post.id, title: props.post.title, body: props.post.body },
  failures: { "post.body-empty": "body" },
  onSuccess: async () => {
    await navigateTo({ name: "posts" });
  },
});
</script>

<template>
  <UForm
    :ref="form.ref"
    :schema="form.schema"
    :state="form.state"
    class="space-y-4"
    @submit="form.submit"
  >
    <UFormField name="title" label="Title">
      <UInput v-model="form.state.title" class="w-full" />
    </UFormField>
    <UFormField name="body" label="Body">
      <UTextarea v-model="form.state.body" class="w-full" />
    </UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending">Save post</UButton>
  </UForm>
</template>
