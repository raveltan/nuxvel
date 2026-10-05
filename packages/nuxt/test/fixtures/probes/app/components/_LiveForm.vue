<script setup lang="ts">
import { z } from "zod";

const schema = z.object({ title: z.string().min(3, "Title needs at least 3 characters") });
const state = reactive({ title: "" });
</script>

<template>
  <UForm :schema="schema" :state="state">
    <UFormField label="Title" name="title" eager-validation>
      <UInput v-model="state.title" />
    </UFormField>
    <UTooltip text="Saves the draft">
      <UButton type="button">Save draft</UButton>
    </UTooltip>
  </UForm>
</template>
