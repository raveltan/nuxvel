<script setup lang="ts">
import type { InputDateProps } from "@nuxt/ui";

const state = reactive({
  name: "",
  bio: "",
  role: undefined as string | undefined,
  tag: undefined as string | undefined,
  terms: false,
  notify: false,
  plan: undefined as string | undefined,
  born: "",
});
const starts = ref<InputDateProps["modelValue"]>();
const sent = ref("");

function submit() {
  sent.value = JSON.stringify({ ...state, starts: starts.value ? String(starts.value) : null });
}
</script>

<template>
  <UForm :state="state" @submit="submit">
    <UFormField name="name" label="Name"><UInput v-model="state.name" /></UFormField>
    <UFormField name="bio" label="Bio"><UTextarea v-model="state.bio" /></UFormField>
    <UFormField name="role" label="Role"><USelect v-model="state.role" :items="['Admin', 'Editor', 'Viewer']" /></UFormField>
    <UFormField name="tag" label="Tag"><USelectMenu v-model="state.tag" :items="['Red', 'Green', 'Blue']" /></UFormField>
    <UFormField name="terms"><UCheckbox v-model="state.terms" label="Accept terms" /></UFormField>
    <UFormField name="notify"><USwitch v-model="state.notify" label="Notify me" /></UFormField>
    <UFormField name="plan" label="Plan"><URadioGroup v-model="state.plan" :items="['Free', 'Pro']" /></UFormField>
    <UFormField name="born" label="Born"><UInput v-model="state.born" type="date" /></UFormField>
    <UFormField name="starts" label="Starts"><UInputDate v-model="starts" /></UFormField>
    <UButton type="submit">Send</UButton>
    <p role="status" aria-label="Sent">{{ sent }}</p>
  </UForm>
</template>
