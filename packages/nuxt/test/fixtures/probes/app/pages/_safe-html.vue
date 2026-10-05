<script setup lang="ts">
const trpc = useTRPC();
const { data } = useQuery(trpc._safeHtmlCheck.sample.queryOptions());
</script>

<template>
  <section class="safe-html">
    <SafeHtml v-if="data" :html="data" />
  </section>
</template>
