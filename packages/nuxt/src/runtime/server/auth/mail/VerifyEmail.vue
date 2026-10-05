<script setup lang="ts">
defineProps<{ url: string }>();
</script>

<template>
  <MailLayout :preview="$t('nuxvel.auth.verifyEmail.preview')">
    <EHeading>{{ $t("nuxvel.auth.verifyEmail.heading") }}</EHeading>
    <EText>{{ $t("nuxvel.auth.verifyEmail.body") }}</EText>
    <EButton :href="url">{{ $t("nuxvel.auth.verifyEmail.button") }}</EButton>
    <EText font-size="14px" color="#6b7280">{{ $t("nuxvel.auth.verifyEmail.ignore") }}</EText>
  </MailLayout>
</template>
