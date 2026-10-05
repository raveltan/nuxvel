<script setup lang="ts">
const { sections, results, open } = useSectionStream();
</script>

<template>
  <div class="h-full of-auto" :data-stream="open ? 'open' : 'closed'">
    <header class="flex items-center justify-between border-b border-base px4 py3">
      <h1 class="text-lg font-bold">
        nuxvel
      </h1>
      <a class="n-link n-link-base" href="/_nuxvel/queue" target="_blank" rel="noopener">Queue board</a>
    </header>
    <DevtoolsSection
      v-for="section in sections"
      :key="section.id"
      :summary="section"
      :result="results[section.id]"
    />
  </div>
</template>
