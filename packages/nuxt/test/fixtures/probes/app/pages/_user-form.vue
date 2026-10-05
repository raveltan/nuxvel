<script setup lang="ts">
const { user } = useUser();
const email = ref("");
</script>

<template>
  <UFormField name="email" :label="user ? 'Your email' : 'Email'">
    <UInput v-model="email" />
  </UFormField>
</template>
