<script setup lang="ts">
import type { InputDateProps } from "@nuxt/ui";

const state = reactive({
  terms: false,
  notify: false,
  plan: undefined as string | undefined,
  tag: undefined as string | undefined,
  role: undefined as string | undefined,
  bio: "",
  file: null as File | null,
});
const starts = ref<InputDateProps["modelValue"]>();
const page = ref(1);
</script>

<template>
  <UForm :state="state">
    <UFormField name="terms"><UCheckbox v-model="state.terms" label="Accept terms" /></UFormField>
    <UFormField name="notify"><USwitch v-model="state.notify" label="Notify me" /></UFormField>
    <UFormField name="plan" label="Plan"><URadioGroup v-model="state.plan" :items="['Free', 'Pro']" /></UFormField>
    <UFormField name="tag" label="Tag"><USelectMenu v-model="state.tag" :items="['Red', 'Green']" placeholder="Pick a tag" /></UFormField>
    <UFormField name="role" label="Role"><USelect v-model="state.role" :items="['Admin', 'Editor']" placeholder="Pick a role" /></UFormField>
    <UFormField name="bio" label="Bio"><UTextarea v-model="state.bio" /></UFormField>
    <UFormField name="starts" label="Starts"><UInputDate v-model="starts" /></UFormField>
    <UFormField name="file" label="File"><UFileUpload v-model="state.file" /></UFormField>
  </UForm>
  <UTable :data="[{ id: 1, title: 'First' }]" />
  <UPagination v-model:page="page" :total="50" />
</template>
