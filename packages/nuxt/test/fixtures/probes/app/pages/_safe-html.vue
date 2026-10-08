<script setup lang="ts">
import { $api } from "@nuxvel/nuxt/app/api";
import { SafeHtml } from "@nuxvel/nuxt/app/ui";

const { data } = useQuery($api._safeHtmlCheck.sample.queryOptions());
</script>

<template>
  <section class="safe-html">
    <SafeHtml v-if="data" :html="data" />
  </section>
</template>
