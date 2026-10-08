<script setup lang="ts">
import { useUser } from "@nuxvel/nuxt/app/auth";

const { user } = useUser();
const email = ref("");
</script>

<template>
  <UFormField name="email" :label="user ? 'Your email' : 'Email'">
    <UInput v-model="email" />
  </UFormField>
</template>
