<script setup lang="ts">
const created = ref<string>();
const form = useActionForm(createTagInput, $api.tag.create.mutationOptions(), {
  defaults: { name: "" },
  onSuccess: (tag) => {
    created.value = tag.name;
  },
});
</script>

<template>
  <UForm :ref="form.ref" :schema="form.schema" :state="form.state" @submit="form.submit">
    <UFormField name="name" label="Name">
      <UInput v-model="form.state.name" />
    </UFormField>
    <UAlert v-if="form.formError" color="error" :title="form.formError" />
    <UButton type="submit" :loading="form.pending">Create tag</UButton>
    <p v-if="created">Created {{ created }}</p>
  </UForm>
</template>
