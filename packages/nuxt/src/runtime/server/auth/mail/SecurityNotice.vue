<script setup lang="ts">
import type { SecurityChange } from "./security-change";

const props = defineProps<{ name: string; change: SecurityChange; device?: string; url?: string }>();

const message = `nuxvel.auth.securityNotice.${props.change === "email" && props.url ? "emailApproval" : props.change}`;
</script>

<template>
  <MailLayout :preview="$t(message)">
    <EHeading>{{ $t("nuxvel.auth.securityNotice.heading") }}</EHeading>
    <EText>{{ $t("nuxvel.auth.securityNotice.greeting", { name }) }}</EText>
    <EText>{{ $t(message) }}</EText>
    <EText v-if="device" font-size="14px">{{ $t("nuxvel.auth.securityNotice.device", { device }) }}</EText>
    <EButton v-if="url" :href="url">{{ $t("nuxvel.auth.securityNotice.button") }}</EButton>
    <EText v-if="url" font-size="14px" color="#6b7280">{{ $t("nuxvel.auth.securityNotice.notYouApproval") }}</EText>
    <EText v-else font-size="14px" color="#6b7280">{{ $t("nuxvel.auth.securityNotice.notYou") }}</EText>
  </MailLayout>
</template>
