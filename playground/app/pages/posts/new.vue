<script setup lang="ts">
definePageMeta({ middleware: "auth", layout: "app" });

const queryCache = useQueryCache();

const form = useActionForm(createPostInput, $api.post.create.mutationOptions(), {
  defaults: { title: "", body: "" },
  onSuccess: async () => {
    await queryCache.invalidateQueries({ key: $api.post.key() });
    await navigateTo({ name: "posts" });
  },
});
</script>

<template>
  <div class="max-w-xl space-y-6">
    <h1 class="text-2xl font-semibold">New post</h1>
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
      <UButton type="submit" :loading="form.pending">Create post</UButton>
    </UForm>
  </div>
</template>
