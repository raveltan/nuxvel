<script setup lang="ts">
const form = useActionForm($api.post.create, {
  defaults: { title: "", body: "" },
  toast: "Post added",
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" @submit="form.submit">
    <UFormField name="title" label="Title">
      <UInput v-model="form.state.title" />
    </UFormField>
    <UButton type="submit" :loading="form.pending">Add post</UButton>
    <NuxtLink :to="{ name: 'posts' }">Posts</NuxtLink>
  </UForm>
</template>
