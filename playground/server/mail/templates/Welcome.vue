<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <MailLayout :preview="$t('mail.welcome.preview')">
    <EHeading>{{ $t("mail.welcome.heading", { name }) }}</EHeading>
    <EText>{{ $t("mail.welcome.body") }}</EText>
    <EButton href="https://nuxvel.test/posts" background-color="#4f46e5">{{ $t("mail.welcome.button") }}</EButton>
    <EText font-size="14px"><ELink href="https://nuxvel.test/feed?page=1&sort=new">Feed</ELink></EText>
  </MailLayout>
</template>
