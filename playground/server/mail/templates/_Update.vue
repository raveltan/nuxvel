<script setup lang="ts">
defineProps<{ title: string; body: string; url?: string }>();
</script>

<template>
  <MailLayout :preview="body">
    <EHeading>{{ title }}</EHeading>
    <EText>{{ body }}</EText>
    <EButton v-if="url" :href="`https://nuxvel.test${url}`">Open</EButton>
  </MailLayout>
</template>
