<script setup lang="ts">
const { data } = useQuery($api._safeHtmlCheck.sample.queryOptions());
</script>

<template>
  <section class="safe-html">
    <SafeHtml v-if="data" :html="data" />
  </section>
</template>
