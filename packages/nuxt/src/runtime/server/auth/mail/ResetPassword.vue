<script setup lang="ts">
defineProps<{ name: string; url: string }>();
</script>

<template>
  <MailLayout :preview="$t('nuxvel.auth.resetPassword.preview')">
    <EHeading>{{ $t("nuxvel.auth.resetPassword.heading") }}</EHeading>
    <EText>{{ $t("nuxvel.auth.resetPassword.body", { name }) }}</EText>
    <EButton :href="url">{{ $t("nuxvel.auth.resetPassword.button") }}</EButton>
    <EText font-size="14px" color="#6b7280">{{ $t("nuxvel.auth.resetPassword.ignore") }}</EText>
  </MailLayout>
</template>
