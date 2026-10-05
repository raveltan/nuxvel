<script setup lang="ts">
import { useHead, useI18n } from "#imports";

const { ts } = useI18n();

useHead({ title: () => ts("nuxvel.offline.title") });
</script>

<template>
  <main>
    <h1>{{ $t("nuxvel.offline.heading") }}</h1>
    <p>{{ $t("nuxvel.offline.body") }}</p>
  </main>
</template>
